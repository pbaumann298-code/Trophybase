import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.jsx'
import { VisibilityProvider } from './context/VisibilityContext.jsx'
import { LocaleProvider } from './context/LocaleContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocaleProvider>
      <VisibilityProvider>
        <App />
      </VisibilityProvider>
    </LocaleProvider>
  </StrictMode>,
)
