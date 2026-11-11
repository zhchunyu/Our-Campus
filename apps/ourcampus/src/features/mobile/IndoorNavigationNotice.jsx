import { Building2 } from 'lucide-react'

export function IndoorNavigationNotice() {
  return (
    <section className="mobile-panel-section mobile-indoor-notice" aria-label="室内导航">
      <div className="mobile-panel-section__heading">
        <h3>室内导航</h3>
        <span>楼层图待接入</span>
      </div>
      <div className="mobile-indoor-notice__card">
        <span className="mobile-indoor-notice__icon"><Building2 size={18} aria-hidden="true" /></span>
        <div>
          <strong>需要可靠的楼层平面图</strong>
          <p>当前项目没有图书馆或教学楼的楼层图和室内通道数据，因此暂不生成室内路线。</p>
        </div>
      </div>
    </section>
  )
}
