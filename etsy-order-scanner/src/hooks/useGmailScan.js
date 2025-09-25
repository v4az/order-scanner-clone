import { useState } from 'react'
import { supabase } from '../config/supabase'
import { GmailService } from '../services/gmailService'

export function useGmailScan() {
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(null)

  const BATCH_SIZE = 20

  const scanEmails = async (accessToken, ownerEmail) => {
    setIsScanning(true)
    setError(null)
    try {
      const gmailService = new GmailService(accessToken, ownerEmail, supabase)
      const emails = await gmailService.searchEmails()
      setProgress({ current: 0, total: emails.length })

      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE)

        // Xử lý đồng thời từng batch
        await Promise.allSettled(
          batch.map(async (email) => {
            try {
              const emailDetail = await gmailService.getEmailDetails(email.id)
              const orderData = gmailService.parseOrderEmail(emailDetail)
              if (orderData) {
                const { error } = await supabase
                  .from('orders')
                  .upsert(orderData, {
                    onConflict: 'order_id',
                    ignoreDuplicates: true
                  })
                if (error) throw error
              }
            } catch (err) {
              // Lỗi của từng email nhưng không dừng loop batch chung
              console.error('Batch email error:', err)
            }
          })
        )

        // Cập nhật progress sau mỗi batch
        setProgress(prev => ({
          ...prev,
          current: Math.min(prev.current + BATCH_SIZE, emails.length)
        }))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsScanning(false)
    }
  }

  return {
    isScanning,
    progress,
    error,
    scanEmails
  }
}
