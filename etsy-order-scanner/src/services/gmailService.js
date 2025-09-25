import { EMAIL_SCAN_CONFIG } from '../config/constants';

export class GmailService {
  constructor(accessToken, ownerEmail, supabase) {
    this.accessToken = accessToken;
    this.ownerEmail = ownerEmail;
    this.supabase = supabase;
    this.baseUrl = 'https://www.googleapis.com/gmail/v1/users/me';
  }

  async fetchGmail(endpoint, options = {}) {
    try {
      const url = new URL(`${this.baseUrl}${endpoint}`);

      if (options.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
          }
        });
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  async getExistingOrdersInRange(startDate, endDate) {
    if (!this.supabase) {
      console.log('Supabase client not available');
      return new Set();
    }

    try {
      const { data, error } = await this.supabase
        .from('orders')
        .select('order_id')
        .eq('owner_email', this.ownerEmail)
        .gte('order_date', startDate)
        .lte('order_date', endDate);

      if (error) throw error;
      return new Set(data?.map(order => order.order_id) || []);
    } catch (error) {
      console.error('Failed to get existing orders:', error);
      return new Set();
    }
  }

  async searchEmails() {
    try {
      console.log('Starting email search...');
      let allEmails = [];

      // First, get the newest order date from database
      const { data: newestOrder } = await this.supabase
        .from('orders')
        .select('order_date')
        .eq('owner_email', this.ownerEmail)
        .order('order_date', { ascending: false })
        .limit(1);

      // Get or set global oldest date
      let { data: metadata } = await this.supabase
        .from('email_scan_metadata')
        .select('global_oldest_date')
        .eq('owner_email', this.ownerEmail)
        .maybeSingle();  // Changed from single() to maybeSingle()

      // If no metadata exists, create it with current date minus 1 year
      if (!metadata) {
        const defaultOldestDate = new Date();
        defaultOldestDate.setFullYear(defaultOldestDate.getFullYear() - 3);

        const { data: newMetadata, error } = await this.supabase
          .from('email_scan_metadata')
          .insert({
            owner_email: this.ownerEmail,
            global_oldest_date: defaultOldestDate.toISOString()
          })
          .select()   // Just select, no single() or maybeSingle() needed for insert
          .then(res => res.data?.[0]);  // Take first result if exists

        if (error) throw error;
        metadata = newMetadata;
      }

      // Get oldest order in database
      const { data: oldestOrder } = await this.supabase
        .from('orders')
        .select('order_date')
        .eq('owner_email', this.ownerEmail)
        .order('order_date', { ascending: true })
        .limit(1);

      // If we have orders, search in two phases
      if (newestOrder?.length > 0) {
        // Phase 1: Get new emails after our newest order
        const newestTimestamp = Math.floor(new Date(newestOrder[0].order_date).getTime() / 1000);
        const newEmailsQuery = `from:transaction@etsy.com "You made a sale on Etsy" after:${newestTimestamp}`;
        console.log('Searching for new emails after:', new Date(newestOrder[0].order_date).toISOString());

        let pageToken = null;
        do {
          const response = await this.fetchGmail('/messages', {
            params: {
              q: newEmailsQuery,
              maxResults: 500,
              ...(pageToken && { pageToken })
            }
          });

          if (!response?.messages?.length) break;
          allEmails = allEmails.concat(response.messages);
          pageToken = response.nextPageToken;
        } while (pageToken);

        // Phase 2: Get emails between global oldest and oldest in database
        if (oldestOrder?.length > 0) {
          const oldestDbTimestamp = Math.floor(new Date(oldestOrder[0].order_date).getTime() / 1000);
          const globalOldestTimestamp = Math.floor(new Date(metadata.global_oldest_date).getTime() / 1000);

          const gapEmailsQuery = `from:transaction@etsy.com "You made a sale on Etsy" after:${globalOldestTimestamp} before:${oldestDbTimestamp}`;
          console.log('Searching for gap emails between:', new Date(metadata.global_oldest_date).toISOString(), 'and', new Date(oldestOrder[0].order_date).toISOString());

          pageToken = null;
          do {
            const response = await this.fetchGmail('/messages', {
              params: {
                q: gapEmailsQuery,
                maxResults: 500,
                ...(pageToken && { pageToken })
              }
            });

            if (!response?.messages?.length) break;
            allEmails = allEmails.concat(response.messages);
            pageToken = response.nextPageToken;
          } while (pageToken);
        }
      } else {
        // First run - get all emails after global oldest date
        const globalOldestTimestamp = Math.floor(new Date(metadata.global_oldest_date).getTime() / 1000);
        const query = `from:transaction@etsy.com "You made a sale on Etsy" after:${globalOldestTimestamp}`;
        console.log('First run - searching for all emails after:', new Date(metadata.global_oldest_date).toISOString());

        let pageToken = null;
        do {
          const response = await this.fetchGmail('/messages', {
            params: {
              q: query,
              maxResults: 500,
              ...(pageToken && { pageToken })
            }
          });

          if (!response?.messages?.length) break;
          allEmails = allEmails.concat(response.messages);
          pageToken = response.nextPageToken;
        } while (pageToken);
      }

      console.log(`Total emails to process: ${allEmails.length}`);
      return allEmails;
    } catch (error) {
      console.error('Search Error:', error);
      throw error;
    }
  }

  async getEmailDetails(messageId) {
    try {
      return await this.fetchGmail(`/messages/${messageId}`, {
        params: { format: 'full' }
      });
    } catch (error) {
      console.error(`Error fetching email ${messageId}:`, error);
      throw error;
    }
  }

  parseOrderEmail(email) {
    try {
      const subject = email.payload.headers.find(h => h.name === 'Subject')?.value;
      console.log('Email subject:', subject);

      const orderMatch = subject.match(/Order #(\d+)/);
      if (!orderMatch) {
        console.log('No order ID found in subject');
        return null;
      }

      const orderId = orderMatch[1];
      console.log('Found order number in subject:', orderId);

      const { content } = this.extractEmailBody(email);
      if (!content) {
        console.log('No email content found');
        return null;
      }

      const buyerEmail = this.extractBuyerEmail(content);
      if (!buyerEmail) {
        console.log('No buyer email found');
        return null;
      }

      return {
        order_id: orderId,
        buyer_email: buyerEmail,
        product_name: this.extractProductName(content) || 'Unknown Product',
        shop_name: this.extractShopName(content) || 'Unknown Shop',
        product_options: this.extractProductOptions(content),
        order_date: new Date(email.payload.headers.find(h => h.name === 'Date')?.value || '').toISOString(),
        extracted_date: new Date().toISOString(),
        owner_email: this.ownerEmail,
        raw_email_data: {
          id: email.id,
          threadId: email.threadId
        }
      };
    } catch (error) {
      console.error('Error parsing email:', error);
      return null;
    }
  }

  extractEmailBody(email) {
    try {
      if (!email.payload) {
        return { content: '' };
      }

      const content = this.findEmailContent(email.payload);
      if (content) {
        return { content: this.decodeBase64(content) };
      }

      return { content: email.snippet || '' };
    } catch (error) {
      console.error('Error extracting email body:', error);
      return { content: '' };
    }
  }

  findEmailContent(part) {
    if (part.parts) {
      for (const subPart of part.parts) {
        const content = this.findEmailContent(subPart);
        if (content) return content;
      }
    }

    if (part.body?.data && (part.mimeType === 'text/html' || part.mimeType === 'text/plain')) {
      return part.body.data;
    }

    return null;
  }

  decodeBase64(encoded) {
    try {
      return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    } catch (error) {
      console.error('Base64 decoding error:', error);
      return '';
    }
  }

  extractProductName(content) {
    try {
      // Try multiple patterns to find product name
      const patterns = [
        /<div[^>]*class="item-name"[^>]*>([^<]+)<\/div>/i,
        /Item:\s*([^\n]+)/i,
        /Title:\s*([^\n]+)/i
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }

      // If no match found from patterns, try to extract from subject
      const subjectLine = content.match(/Subject:.*Order.*?\[(.*?)\]/i);
      if (subjectLine && subjectLine[1]) {
        return subjectLine[1].trim();
      }

      return 'Unknown Product';
    } catch (error) {
      console.error('Error extracting product name:', error);
      return 'Unknown Product';
    }
  }

  extractBuyerEmail(content) {
    try {
      const mailtoPattern = /mailto:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const mailtoMatches = [...content.matchAll(mailtoPattern)];

      for (const match of mailtoMatches) {
        const email = match[1];
        if (!email.includes('transaction@etsy.com')) {
          return email;
        }
      }

      const generalEmailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const allEmails = [...content.matchAll(generalEmailPattern)]
        .map(match => match[0])
        .filter(email => !email.includes('etsy.com'));

      return allEmails[0] || null;
    } catch (error) {
      console.error('Error extracting buyer email:', error);
      return null;
    }
  }

  extractProductOptions(content) {
    try {
      const options = {};
      const optionsPattern = /(Size|Color|Style|Type):\s*([^,\n]+)/gi;
      let match;

      while ((match = optionsPattern.exec(content)) !== null) {
        const [, key, value] = match;
        if (key && value) {
          options[key.trim()] = value.trim();
        }
      }

      return Object.keys(options).length > 0 ? options : null;
    } catch (error) {
      console.error('Error extracting product options:', error);
      return null;
    }
  }

  extractShopName(content) {
    try {
      // Try multiple patterns to find shop name
      const patterns = [
        /Shop name:\s*([^<\n]+)/i,
        /Shop:\s*([^<\n]+)/i,
        /Seller:\s*([^<\n]+)/i
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }

      // Fallback to extracting from subject line if available
      const subjectMatch = content.match(/Subject:[^\n]*?from\s+([^-\n]+)/i);
      if (subjectMatch && subjectMatch[1]) {
        return subjectMatch[1].trim();
      }

      return 'Unknown Shop';
    } catch (error) {
      console.error('Error extracting shop name:', error);
      return 'Unknown Shop';
    }
  }

}
