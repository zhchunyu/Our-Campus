import { useState } from 'react'
import { Flower2, MapPin } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState.jsx'
import { teamCampusMap } from '../../data/campusMap.js'
import { COMPETITION_PRESENTATION } from '../../data/campusPresentation.js'
import { Campus2DViewer } from './Campus2DViewer.jsx'
import { TencentCampusMap } from './TencentCampusMap.jsx'
import { MapSearchOverlay } from './MapSearchOverlay.jsx'
import { MapToolbar } from './MapToolbar.jsx'
import { HotspotLegend } from '../events/HotspotLegend.jsx'
import { projectVisibleMapContent } from './mapVisibility.js'
import { DeviceLocationControl } from './DeviceLocationControl.jsx'

const hasTencentMapKey = Boolean(import.meta.env.VITE_TENCENT_MAP_KEY)

export function MapWorkspace({
  locations,
  visibleLocations = locations,
  events,
  searchResults = [],
  selectedId,
  query,
  category,
  toolbarOpen,
  activeTool,
  role,
  settings,
  resetViewToken,
  currentLocationId,
  livePosition,
  livePositionFocusToken,
  deviceLocationStatus,
  deviceLocationMessage,
  routePlan,
  canUndoAdminAction,
  lastAdminAction,
  onPublishEvent,
  onUpdateEvent,
  onCloseEvent,
  onUndoAdminAction,
  onToggleToolbar,
  onToolChange,
  onRoleChange,
  onCurrentLocationChange,
  onLocateDevice,
  onSettingsChange,
  onResetSettings,
  onResetView,
  onFullscreen,
  onClearRoute,
  onClearCurrentLocation,
  onResetDemoData,
  onSelectLocation,
  onPlanRouteToLocation,
  onOpenFeedback,
  onRouteStateChange,
  onQueryChange,
  onSelectSearchResult,
  onCategoryChange,
  lostFoundPosts = [],
  onOpenHall,
}) {
  const [mapProvider, setMapProvider] = useState(hasTencentMapKey ? 'tencent' : 'campus')
  const {
    visibleLocationIds,
    activeEvents,
    visibleEvents,
  } = projectVisibleMapContent({ visibleLocations, events, settings })
  const displayedRoutePlan = settings.showRoute ? routePlan : null
  const mapMarkerLocationIds = visibleLocationIds
  const visibleLostFound = settings.showLostFound
    ? lostFoundPosts.filter((post) => post.status === 'active' && visibleLocationIds.has(post.locationId))
    : []

  return (
    <section className="map-workspace" aria-label={`${teamCampusMap.campusName}地图工作区`}>
      <div className="campus-map-footer-heading" aria-hidden="true"><div><small>校园漫游</small><strong>下一站，去哪里？</strong></div><Flower2 size={29} /></div>
      <MapSearchOverlay
        query={query}
        category={category}
        results={searchResults}
        onQueryChange={onQueryChange}
        onCategoryChange={onCategoryChange}
        onSelectResult={onSelectSearchResult}
      />
      <MapToolbar
        open={toolbarOpen}
        activeTool={activeTool}
        role={role}
        settings={settings}
        locations={locations}
        events={activeEvents}
        currentLocationId={currentLocationId}
        canUndoAdminAction={canUndoAdminAction}
        lastAdminAction={lastAdminAction}
        onToggle={onToggleToolbar}
        onToolChange={onToolChange}
        onRoleChange={onRoleChange}
        onCurrentLocationChange={onCurrentLocationChange}
        onSettingsChange={onSettingsChange}
        onResetSettings={onResetSettings}
        onResetView={onResetView}
        onFullscreen={onFullscreen}
        onClearRoute={onClearRoute}
        onClearCurrentLocation={onClearCurrentLocation}
        onResetDemoData={onResetDemoData}
        onPublishEvent={onPublishEvent}
        onUpdateEvent={onUpdateEvent}
        onCloseEvent={onCloseEvent}
        onUndoAdminAction={onUndoAdminAction}
      />
      <DeviceLocationControl
        status={deviceLocationStatus}
        message={deviceLocationMessage}
        onLocate={onLocateDevice}
      />

      <div className={`map-surface map-surface--2d ${displayedRoutePlan ? 'has-route' : ''}`} aria-label={`${teamCampusMap.campusName}二维校园平面图`}>
        {mapProvider === 'tencent' && hasTencentMapKey ? (
          <TencentCampusMap
            locations={locations}
            visibleLocationIds={mapMarkerLocationIds}
            events={visibleEvents}
            lostFoundPosts={visibleLostFound}
            allLostFoundPosts={lostFoundPosts}
            selectedId={selectedId}
            currentLocationId={settings.showCurrentLocation ? currentLocationId : null}
            livePosition={livePosition}
            livePositionFocusToken={livePositionFocusToken}
            routePlan={displayedRoutePlan}
            showLabels={settings.showLabels}
            showStatusColors={settings.showStatusColors}
            resetViewToken={resetViewToken}
            onSelectLocation={onSelectLocation}
            onPlanRouteToLocation={onPlanRouteToLocation}
            onOpenFeedback={onOpenFeedback}
            onRouteStateChange={onRouteStateChange}
            onUseCampusMap={COMPETITION_PRESENTATION ? undefined : () => setMapProvider('campus')}
          />
        ) : COMPETITION_PRESENTATION ? (
          <div className="map-unavailable-note" role="status">
            <MapPin size={16} /><strong>地图资源暂不可用</strong>
            <span>请检查网络及地图配置后重试。</span>
          </div>
        ) : (
          <>
            <Campus2DViewer
              mapUrl={teamCampusMap.scenes['2d'].imageUrl}
              imageWidth={teamCampusMap.scenes['2d'].imageWidth}
              imageHeight={teamCampusMap.scenes['2d'].imageHeight}
              imageCrop={teamCampusMap.scenes['2d'].crop}
              locations={locations}
              visibleLocationIds={visibleLocationIds}
              mapMarkerLocationIds={mapMarkerLocationIds}
              events={visibleEvents}
              lostFoundLocationIds={new Set(visibleLostFound.map((post) => post.locationId))}
              selectedId={selectedId}
              currentLocationId={settings.showCurrentLocation ? currentLocationId : null}
              livePosition={livePosition}
              livePositionFocusToken={livePositionFocusToken}
              routePlan={displayedRoutePlan}
              showLabels={settings.showLabels}
              showStatusColors={settings.showStatusColors}
              showTips={settings.showTips}
              resetViewToken={resetViewToken}
              onSelectLocation={onSelectLocation}
            />
            <div className="map-source-note">
              <MapPin size={15} />
              <span>
                <strong>{teamCampusMap.campusName}</strong>
                <small>{teamCampusMap.scenes['2d'].sourceLabel} · {teamCampusMap.version}</small>
              </span>
            </div>
          </>
        )}
        {visibleLocations.length === 0 && !query.trim() && category !== 'all' && (
          <div className="map-empty-state">
            <EmptyState
              onReset={() => {
                onQueryChange('')
                onCategoryChange('all')
              }}
            />
          </div>
        )}
      </div>
      {settings.showHotspots && <HotspotLegend />}
    </section>
  )
}
