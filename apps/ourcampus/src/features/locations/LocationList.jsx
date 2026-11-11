import { ArrowUpRight, Building2, Navigation, Users } from 'lucide-react'
import { CATEGORY_LABELS, CROWD_STATUS_LABELS, OPEN_STATUS_LABELS } from '../../domain/campus.js'
import { EmptyState } from '../../components/EmptyState.jsx'
import { StatusBadge } from '../../components/StatusBadge.jsx'

function openTone(status) {
  return status === 'open' ? 'open' : status === 'limited' ? 'limited' : 'closed'
}

function crowdTone(status) {
  return status === 'busy' ? 'busy' : status === 'normal' ? 'normal' : 'low'
}

export function LocationList({ locations, selectedId, onSelect, onPlanRoute, onReset }) {
  if (locations.length === 0) {
    return <EmptyState onReset={onReset} />
  }

  return (
    <div className="location-list">
      {locations.map((location, index) => {
        const summary = location.description && !location.description.startsWith('地图标注的')
          ? location.description
          : ''

        return (
          <article
            className={`location-card ${selectedId === location.id ? 'is-selected' : ''}`}
            key={location.id}
          >
            <button className="location-card__select" type="button" onClick={() => onSelect(location.id)}>
              <span className="location-card__topline">
                <span className="location-card__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="location-card__category">{CATEGORY_LABELS[location.category]}</span>
                <ArrowUpRight className="location-card__arrow" size={17} />
              </span>
              <span className="location-card__title-row">
                <span className="location-card__icon"><Building2 size={18} /></span>
                <span className="location-card__copy">
                  <strong>{location.name}</strong>
                  {summary && <small>{summary}</small>}
                </span>
              </span>
              <span className="location-card__bottomline">
                <StatusBadge label={OPEN_STATUS_LABELS[location.openStatus]} tone={openTone(location.openStatus)} />
                <span className={`crowd-note crowd-note--${crowdTone(location.crowdStatus)}`}>
                  <Users size={13} /> {CROWD_STATUS_LABELS[location.crowdStatus]}
                </span>
              </span>
            </button>
            {onPlanRoute && (
              <button className="location-card__navigate" type="button" onClick={() => onPlanRoute(location.id)}>
                <Navigation size={14} /> 去这里
              </button>
            )}
          </article>
        )
      })}
    </div>
  )
}
