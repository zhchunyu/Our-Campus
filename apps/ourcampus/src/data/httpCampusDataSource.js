function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

export function createHttpCampusDataSource({ baseUrl = '/api', fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('HTTP 数据源需要可用的 fetch 实现')
  }

  async function request(path, options = {}) {
    const response = await fetchImpl(joinUrl(baseUrl, path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })

    if (!response.ok) throw new Error(`校园数据请求失败：${response.status}`)
    return response.json()
  }

  return {
    loadSnapshot() {
      return request('/snapshot')
    },

    updateLocation(id, patch) {
      return request(`/locations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },

    publishEvent(event) {
      return request('/events', {
        method: 'POST',
        body: JSON.stringify(event),
      })
    },

    closeEvent(id) {
      return request(`/events/${encodeURIComponent(id)}/close`, { method: 'POST' })
    },

    subscribe(listener) {
      if (typeof globalThis.EventSource !== 'function') return () => {}

      const stream = new globalThis.EventSource(joinUrl(baseUrl, '/stream'))
      stream.onmessage = (message) => {
        try {
          listener(JSON.parse(message.data))
        } catch {
          // 忽略无法解析的推送，保留前端演示继续运行。
        }
      }
      return () => stream.close()
    },
  }
}
