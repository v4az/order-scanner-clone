// src/config/constants.js

export const APP_URL = import.meta.env.PROD 
  ? 'https://etsy-order-scanner.pages.dev'
  : 'http://localhost:5173';

export const GMAIL_CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID;

// Gmail API configuration
export const GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
];

// Email scanning configuration
export const EMAIL_SCAN_CONFIG = {
    sender: 'transaction@etsy.com',
    subject: 'You made a sale on Etsy',
    lookbackDays: 365,
    batchSize: 50 // Number of emails to process in each batch
};

// Application settings
export const APP_CONFIG = {
    maxRetries: 3, // Maximum number of retries for failed API calls
    retryDelay: 1000, // Delay between retries in milliseconds
    dateFormat: 'YYYY-MM-DD', // Default date format for display
    timezone: 'UTC' // Default timezone for date handling
};

// Table display configuration
export const TABLE_CONFIG = {
    pageSize: 10,
    pageSizeOptions: ['10', '20', '50', '100'],
    defaultSortField: 'order_date',
    defaultSortOrder: 'descend'
};

// Export configuration
export const EXPORT_CONFIG = {
    filename: 'etsy_orders_export',
    dateFormat: 'YYYY-MM-DD_HH-mm',
    formats: {
        csv: {
            delimiter: ',',
            headers: true
        },
        excel: {
            sheetName: 'Etsy Orders',
            autoWidth: true
        }
    }
};