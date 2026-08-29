import { eastData } from './regions/east'
import { southData } from './regions/south'
import { westNorthData } from './regions/westnorth'
import type { Attraction, CityClimate, CityCost } from '../types'

export const REGIONS = [eastData, southData, westNorthData]

export const ALL_ATTRACTIONS: Attraction[] = REGIONS.flatMap((r) => r.attractions)
export const ALL_CITIES: CityCost[] = REGIONS.flatMap((r) => r.cities)
export const ALL_CLIMATE: CityClimate[] = REGIONS.flatMap((r) => r.climate)

const attractionById = new Map(ALL_ATTRACTIONS.map((a) => [a.id, a]))
export function getAttraction(id: string): Attraction | undefined {
  return attractionById.get(id)
}

const cityByName = new Map(ALL_CITIES.map((c) => [c.city, c]))
export function getCity(name: string): CityCost | undefined {
  return cityByName.get(name)
}

export function getClimate(city: string): CityClimate | undefined {
  return ALL_CLIMATE.find((c) => c.city === city)
}

export const ALL_PROVINCES = [...new Set(ALL_CITIES.map((c) => c.province))].sort(
  (a, b) => a.localeCompare(b, 'zh'),
)
