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
import './features/mobile/canvasTheme.css'
import './features/mobile/community-canvas.css'
import './features/mobile/personal-canvas.css'
import './features/mobile/inner-canvas.css'

document.documentElement.classList.add('canvas-ui')

const previewMode = new URLSearchParams(window.location.search).get('preview')
// 电脑浏览器默认进入手机同尺寸预览；显式 ?preview=phone 在开发和生产构建里都生效。
const shouldShowPhonePreview = previewMode === 'phone'
  || (import.meta.env.DEV && !previewMode && !window.matchMedia('(pointer: coarse)').matches)
document.documentElement.toggleAttribute('data-local-phone-preview', previewMode === 'mobile')

startStartup({ previewShell: shouldShowPhonePreview })

ReactDOM.createRoot(document.getElementById('root')).render(
  shouldShowPhonePreview ? <PhonePreviewShell /> : <App />,
)
