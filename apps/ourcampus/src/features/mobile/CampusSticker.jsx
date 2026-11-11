export function CampusSticker({ Icon, tone = 'mint', className = '' }) {
  return <span className={`campus-sticker campus-sticker--${tone} ${className}`} aria-hidden="true"><Icon size={30} strokeWidth={2.1} /><i /><b /></span>
}
