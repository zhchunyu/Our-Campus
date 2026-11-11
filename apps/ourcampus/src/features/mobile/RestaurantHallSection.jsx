import { ChevronRight, UtensilsCrossed } from 'lucide-react'
import { isRestaurantLocation } from '../../data/restaurantReviews.js'

export function RestaurantHallSection({ locations, onOpenReviews }) {
  const restaurants = locations.filter(isRestaurantLocation)

  return <div className="community-content restaurant-hall">
    <div className="restaurant-hall__intro">
      <span className="restaurant-hall__intro-icon"><UtensilsCrossed size={24} aria-hidden="true" /></span>
      <div><strong>校园餐厅评价</strong><p>选一家餐厅，再看看各窗口的评价。</p></div>
    </div>
    <div className="community-list-heading"><h3>选择餐厅</h3><span>{restaurants.length} 家</span></div>
    {restaurants.length ? <div className="restaurant-hall__list">
      {restaurants.map((restaurant, index) => <button className="restaurant-hall__card" type="button" key={restaurant.id} onClick={() => onOpenReviews(restaurant.id)}>
        <span className="restaurant-hall__number">{String(index + 1).padStart(2, '0')}</span>
        <span className="restaurant-hall__card-copy"><strong>{restaurant.name}</strong><small>查看餐厅窗口 · 同学用餐评价</small></span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>)}
    </div> : <div className="community-empty"><UtensilsCrossed size={30} /><strong>暂未收录餐厅</strong><p>餐厅地点收录后会显示在这里。</p></div>}
    <p className="community-footnote">窗口名单由管理员维护；评价来源会在窗口详情中标明。</p>
  </div>
}
