import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { PhonePreviewShell } from './features/mobile/PhonePreviewShell.jsx'
import { startStartup } from './app/startup.js'
import './styles.css'
import './features/mobile/community.css'
import './features/mobile/account-chat.css'
import './features/reviews/restaurant-reviews.css'
import './features/mobile/navigation.css'
import './features/ai/auv.css'
import './features/mobile/campusFreshTheme.css'
import './features/mobile/personalHome.css'
import './features/mobile/campusLifeTheme.css'

const previewMode = new URLSearchParams(window.location.search).get('preview')
document.documentElement.toggleAttribute('data-local-phone-preview', import.meta.env.DEV && previewMode === 'mobile')
const shouldShowPhonePreview = import.meta.env.DEV
  && (previewMode === 'phone' || (
    !window.matchMedia('(pointer: coarse)').matches
    && !previewMode
  ))

startStartup({ previewShell: shouldShowPhonePreview })

ReactDOM.createRoot(document.getElementById('root')).render(
  shouldShowPhonePreview ? <PhonePreviewShell /> : <App />,
)
