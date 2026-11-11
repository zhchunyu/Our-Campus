import { LoaderCircle, LocateFixed } from 'lucide-react'

export function DeviceLocationControl({ status = 'idle', message = '', onLocate }) {
  const isLocating = status === 'loading'

  return (
    <div className="device-location-control">
      <button
        className={`device-location-control__button${status === 'located' ? ' is-located' : ''}`}
        type="button"
        aria-label="定位到我的当前位置"
        title="定位到我的当前位置"
        disabled={isLocating}
        onClick={onLocate}
      >
        {isLocating ? <LoaderCircle className="device-location-control__spinner" size={19} /> : <LocateFixed size={19} />}
        <span>{isLocating ? '定位中' : status === 'located' ? '已定位' : '定位'}</span>
      </button>
      {message && <p className="device-location-control__message" role="status">{message}</p>}
    </div>
  )
}
