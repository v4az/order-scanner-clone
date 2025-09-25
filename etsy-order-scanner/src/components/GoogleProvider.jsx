// src/components/GoogleProvider.jsx
import { GoogleOAuthProvider } from '@react-oauth/google'
import { GMAIL_CLIENT_ID } from '../config/constants'

export default function GoogleProvider({ children }) {
  return (
    <GoogleOAuthProvider clientId={GMAIL_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  )
}