import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.jsx'
import { VisibilityProvider } from './context/VisibilityContext.jsx'
import { LocaleProvider } from './context/LocaleContext.jsx'
import { MediaConsentProvider } from './context/MediaConsentContext.jsx'
import { registerPwa } from './lib/registerPwa.js'

registerPwa()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocaleProvider>
      <VisibilityProvider>
        <MediaConsentProvider>
          <App />
        </MediaConsentProvider>
      </VisibilityProvider>
    </LocaleProvider>
  </StrictMode>,
)
