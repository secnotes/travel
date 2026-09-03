import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { ItineraryPlan, PlanActivity } from '../types'

/** 每日配色（与 DayCard 视觉呼应） */
const DAY_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2',
  '#db2777', '#65a30d', '#d97706', '#4f46e5', '#dc2626',
]

/**
 * 高德矢量瓦片（免 Key）。坐标体系为 GCJ-02，
 * 与数据集中存储的 GCJ-02 坐标天然对齐。
 */
const AMAP_TILES =
  'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'

function colorOfDay(day: number): string {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length]
}

function dayIcon(day: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="day-marker" style="background:${colorOfDay(day)}">D${day}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

interface MappedActivity extends PlanActivity {
  day: number
  seq: number
  color: string
}

/** 自适应视野：行程点变化时 fit bounds */
function FitBounds({ points }: { points: MappedActivity[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].coords![1], points[0].coords![0]], 12)
      return
    }
    const bounds = L.latLngBounds(
      points.map((p) => [p.coords![1], p.coords![0]] as [number, number]),
    )
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [points, map])
  return null
}

export default function MapView({ plan }: { plan: ItineraryPlan }) {
  const points = useMemo<MappedActivity[]>(() => {
    const out: MappedActivity[] = []
    for (const day of plan.days) {
      let seq = 0
      for (const act of day.activities) {
        if (!act.coords) continue
        seq += 1
        out.push({ ...act, day: day.day, seq, color: colorOfDay(day.day) })
      }
    }
    return out
  }, [plan])

  const center: [number, number] =
    points.length > 0 ? [points[0].coords![1], points[0].coords![0]] : [35, 105]

  const dayGroups = useMemo(() => {
    const groups = new Map<number, MappedActivity[]>()
    for (const p of points) {
      if (!groups.has(p.day)) groups.set(p.day, [])
      groups.get(p.day)!.push(p)
    }
    return [...groups.entries()]
  }, [points])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-700">🗺️ 行程动线</h3>
        <div className="flex gap-1.5 flex-wrap">
          {dayGroups.map(([day, pts]) => (
            <span
              key={day}
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
              style={{ background: colorOfDay(day) }}
            >
              D{day}·{pts.length}
            </span>
          ))}
        </div>
      </div>
      <div className="h-72">
        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            url={AMAP_TILES}
            subdomains={['1', '2', '3', '4']}
            attribution='&copy; 高德地图'
            maxZoom={18}
          />
          {dayGroups.map(([day, pts]) => (
            <Polyline
              key={day}
              positions={pts.map((p) => [p.coords![1], p.coords![0]])}
              pathOptions={{
                color: colorOfDay(day),
                weight: 3,
                opacity: 0.75,
                dashArray: '6 6',
              }}
            />
          ))}
          {points.map((p, i) => (
            <Marker
              key={`${p.day}-${p.seq}-${i}`}
              position={[p.coords![1], p.coords![0]]}
              icon={dayIcon(p.day)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">
                    D{p.day} 第{p.seq}站 · {p.name}
                  </p>
                  <p className="text-slate-500">
                    {p.startTime} - {p.endTime}
                    {p.ticket ? ` · 门票 ¥${p.ticket}` : ''}
                  </p>
                  {p.note && <p className="text-slate-500 mt-1">{p.note}</p>}
                </div>
              </Popup>
            </Marker>
          ))}
          <FitBounds points={points} />
        </MapContainer>
      </div>
    </div>
  )
}
