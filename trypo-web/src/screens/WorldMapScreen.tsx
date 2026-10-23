import { useState, useEffect, useMemo, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import type { Screen } from "../App"
import { useAuth, useMyAvatar } from "../lib/auth"
import { getMyTrips, processAvatarFile } from "../lib/trips"
import { resolveKnownCoords, resolveCityCoordsLive } from "../lib/geocode"
import {
  configureMapbox,
  hasMapboxToken,
  MAPBOX_STYLES,
  applyMapTheme,
  type MapboxStyleKey,
} from "../lib/mapbox"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

export type MemoryPhoto = {
  id: string
  url: string
  title: string
  city: string
  date: string
  caption: string
  likes: number
}

export type MemoryStory = {
  id: string
  title: string
  city: string
  category: "Culture" | "Gastronomie" | "Nature" | "Aventure" | "Détente"
  date: string
  notes: string
  icon: string
}

export type CitySpot = {
  name: string
  lat: number
  lng: number
  visitedYear: number
}

export type Country = {
  name: string
  frenchName: string
  flag: string
  continent: "Europe" | "Asia" | "Africa" | "Americas" | "Oceania"
  year: number
  lat: number
  lng: number
  citiesCount: number
  memoriesCount: number
  visited: boolean
  /** True when checked manually on the map (not from a trip). */
  manual?: boolean
  cities: CitySpot[]
  photos: MemoryPhoto[]
  stories: MemoryStory[]
}

const COUNTRIES: Country[] = [
  {
    name: "Tunisia",
    frenchName: "Tunisie",
    flag: "🇹🇳",
    continent: "Africa",
    year: 2019,
    lat: 34.8,
    lng: 9.9,
    citiesCount: 4,
    memoriesCount: 18,
    visited: true,
    cities: [
      { name: "Tunis", lat: 36.8065, lng: 10.1815, visitedYear: 2019 },
      { name: "Sidi Bou Saïd", lat: 36.8703, lng: 10.3414, visitedYear: 2019 },
      { name: "Sousse", lat: 35.8256, lng: 10.6369, visitedYear: 2019 },
      { name: "Carthage", lat: 36.8529, lng: 10.3217, visitedYear: 2019 },
    ],
    photos: [
      {
        id: "tn-1",
        url: "https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=900&auto=format&fit=crop&q=80",
        title: "Ruelles bleues de Sidi Bou Saïd",
        city: "Sidi Bou Saïd",
        date: "14 Juin 2019",
        caption: "Architecture immaculée blanche et bleue suspendue au-dessus du golfe de Tunis.",
        likes: 42,
      },
      {
        id: "tn-2",
        url: "https://images.unsplash.com/photo-1559628232-ce2823eb1bfd?w=900&auto=format&fit=crop&q=80",
        title: "Médina & Souks de Tunis",
        city: "Tunis",
        date: "12 Juin 2019",
        caption: "Parfums de jasmin, artisanat traditionnel et portes cloutées historiques.",
        likes: 38,
      },
      {
        id: "tn-3",
        url: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=900&auto=format&fit=crop&q=80",
        title: "Coucher de soleil sur la plage",
        city: "Sousse",
        date: "16 Juin 2019",
        caption: "Lumière dorée spectaculaire sur les remparts de Sousse.",
        likes: 29,
      },
      {
        id: "tn-4",
        url: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=900&auto=format&fit=crop&q=80",
        title: "Colline de Byrsa & Ruines",
        city: "Carthage",
        date: "13 Juin 2019",
        caption: "Colonnes antiques romaines avec panorama infini sur la mer.",
        likes: 35,
      },
    ],
    stories: [
      {
        id: "st-tn-1",
        title: "Thé à la menthe au Café des Délices",
        city: "Sidi Bou Saïd",
        category: "Détente",
        date: "Juin 2019",
        notes: "Dégustation de thé aux pignons face au coucher de soleil sur la Méditerranée.",
        icon: "☕",
      },
      {
        id: "st-tn-2",
        title: "Exploration des ruines puniques et romaines",
        city: "Carthage",
        category: "Culture",
        date: "Juin 2019",
        notes: "Visite des thermes d'Antonin et découverte de l'histoire carthaginoise.",
        icon: "🏛️",
      },
      {
        id: "st-tn-3",
        title: "Dîner gastronomique au cœur de la Médina",
        city: "Tunis",
        category: "Gastronomie",
        date: "Juin 2019",
        notes: "Couscous royal au mérou et pâtisseries aux amandes dans un ancien palais.",
        icon: "🍲",
      },
    ],
  },
  {
    name: "Japan",
    frenchName: "Japon",
    flag: "🇯🇵",
    continent: "Asia",
    year: 2022,
    lat: 36.2048,
    lng: 138.2529,
    citiesCount: 5,
    memoriesCount: 22,
    visited: true,
    cities: [
      { name: "Tokyo", lat: 35.6762, lng: 139.6503, visitedYear: 2022 },
      { name: "Kyoto", lat: 35.0116, lng: 135.7681, visitedYear: 2022 },
      { name: "Osaka", lat: 34.6937, lng: 135.5023, visitedYear: 2022 },
      { name: "Nara", lat: 34.6851, lng: 135.8048, visitedYear: 2022 },
    ],
    photos: [
      {
        id: "jp-1",
        url: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=900&auto=format&fit=crop&q=80",
        title: "Néons de Shibuya & Tokyo Tower",
        city: "Tokyo",
        date: "20 Octobre 2022",
        caption: "L'effervescence futuriste de Tokyo la nuit sous les pluies de néons.",
        likes: 64,
      },
      {
        id: "jp-2",
        url: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=900&auto=format&fit=crop&q=80",
        title: "Torii rouges de Fushimi Inari",
        city: "Kyoto",
        date: "24 Octobre 2022",
        caption: "Ascension matinale silencieuse sous les 10 000 portes sacrées.",
        likes: 71,
      },
      {
        id: "jp-3",
        url: "https://images.unsplash.com/photo-1528164344705-475426879c0d?w=900&auto=format&fit=crop&q=80",
        title: "Mont Fuji & Pagode Chureito",
        city: "Hakone",
        date: "27 Octobre 2022",
        caption: "Vue légendaire au lever du jour avec les érables flamboyants.",
        likes: 88,
      },
    ],
    stories: [
      {
        id: "st-jp-1",
        title: "Dégustation d'Omakase à Tsukiji",
        city: "Tokyo",
        category: "Gastronomie",
        date: "Octobre 2022",
        notes: "Expérience sushi inoubliable préparée pièce par pièce par le maître chef.",
        icon: "🍣",
      },
      {
        id: "st-jp-2",
        title: "Bambouseraie d'Arashiyama au lever du soleil",
        city: "Kyoto",
        category: "Nature",
        date: "Octobre 2022",
        notes: "Atmosphère paisible et bruissement envoûtant des bambous géants.",
        icon: "🎋",
      },
    ],
  },
  {
    name: "France",
    frenchName: "France",
    flag: "🇫🇷",
    continent: "Europe",
    year: 2021,
    lat: 46.5,
    lng: 2.5,
    citiesCount: 6,
    memoriesCount: 16,
    visited: true,
    cities: [
      { name: "Paris", lat: 48.8566, lng: 2.3522, visitedYear: 2021 },
      { name: "Nice", lat: 43.7102, lng: 7.262, visitedYear: 2021 },
      { name: "Lyon", lat: 45.764, lng: 4.8357, visitedYear: 2021 },
      { name: "Bordeaux", lat: 44.8378, lng: -0.5792, visitedYear: 2021 },
    ],
    photos: [
      {
        id: "fr-1",
        url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=900&auto=format&fit=crop&q=80",
        title: "Tour Eiffel Scintillante",
        city: "Paris",
        date: "18 Mai 2021",
        caption: "Soirée magique sur les quais de Seine face à la dame de fer.",
        likes: 53,
      },
      {
        id: "fr-2",
        url: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&auto=format&fit=crop&q=80",
        title: "Promenade des Anglais & Mer Azur",
        city: "Nice",
        date: "22 Mai 2021",
        caption: "L'eau turquoise éclatante de la Baie des Anges.",
        likes: 47,
      },
    ],
    stories: [
      {
        id: "st-fr-1",
        title: "Visite nocturne du Musée du Louvre",
        city: "Paris",
        category: "Culture",
        date: "Mai 2021",
        notes: "Pyramide de verre illuminée et chefs-d'œuvre de la Renaissance.",
        icon: "🎨",
      },
    ],
  },
  {
    name: "Morocco",
    frenchName: "Maroc",
    flag: "🇲🇦",
    continent: "Africa",
    year: 2024,
    lat: 31.7917,
    lng: -7.0926,
    citiesCount: 3,
    memoriesCount: 12,
    visited: true,
    cities: [
      { name: "Marrakech", lat: 31.6295, lng: -7.9811, visitedYear: 2024 },
      { name: "Chefchaouen", lat: 35.1716, lng: -5.2697, visitedYear: 2024 },
      { name: "Essaouira", lat: 31.5085, lng: -9.7595, visitedYear: 2024 },
    ],
    photos: [
      {
        id: "ma-1",
        url: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=900&auto=format&fit=crop&q=80",
        title: "Jardin Majorelle & Bleu Cobalt",
        city: "Marrakech",
        date: "10 Mars 2024",
        caption: "Oasis botanique féérique au cœur de la ville ocre.",
        likes: 59,
      },
      {
        id: "ma-2",
        url: "https://images.unsplash.com/photo-1548013146-72479768bada?w=900&auto=format&fit=crop&q=80",
        title: "La Perle Bleue du Rif",
        city: "Chefchaouen",
        date: "14 Mars 2024",
        caption: "Déambulation dans les ruelles peintes de nuances d'azur et d'indigo.",
        likes: 66,
      },
    ],
    stories: [
      {
        id: "st-ma-1",
        title: "Nuit étoilée dans le désert d'Agafay",
        city: "Marrakech",
        category: "Aventure",
        date: "Mars 2024",
        notes: "Tentes berbères de luxe, feu de camp et musique gnaoua sous les étoiles.",
        icon: "⛺",
      },
    ],
  },
  {
    name: "Italy",
    frenchName: "Italie",
    flag: "🇮🇹",
    continent: "Europe",
    year: 2021,
    lat: 42.5,
    lng: 12.8,
    citiesCount: 4,
    memoriesCount: 11,
    visited: true,
    cities: [
      { name: "Rome", lat: 41.9028, lng: 12.4964, visitedYear: 2021 },
      { name: "Venise", lat: 45.4408, lng: 12.3155, visitedYear: 2021 },
      { name: "Florence", lat: 43.7696, lng: 11.2558, visitedYear: 2021 },
    ],
    photos: [
      {
        id: "it-1",
        url: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=900&auto=format&fit=crop&q=80",
        title: "Colisée majestueux au crépuscule",
        city: "Rome",
        date: "12 Septembre 2021",
        caption: "Deux mille ans d'histoire sous la lumière d'or italienne.",
        likes: 51,
      },
      {
        id: "it-2",
        url: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&auto=format&fit=crop&q=80",
        title: "Gondoles sur le Grand Canal",
        city: "Venise",
        date: "16 Septembre 2021",
        caption: "Navigation poétique le long des palais vénitiens.",
        likes: 58,
      },
    ],
    stories: [
      {
        id: "st-it-1",
        title: "Vraie Pizza Napolitaine & Gelato Artisanal",
        city: "Rome",
        category: "Gastronomie",
        date: "Septembre 2021",
        notes: "Saveurs authentiques dans le quartier chaleureux du Trastevere.",
        icon: "🍕",
      },
    ],
  },
  {
    name: "Indonesia",
    frenchName: "Indonésie",
    flag: "🇮🇩",
    continent: "Asia",
    year: 2023,
    lat: -2.5,
    lng: 118.0,
    citiesCount: 2,
    memoriesCount: 8,
    visited: true,
    cities: [
      { name: "Bali", lat: -8.4095, lng: 115.1889, visitedYear: 2023 },
      { name: "Ubud", lat: -8.5069, lng: 115.2625, visitedYear: 2023 },
    ],
    photos: [
      {
        id: "id-1",
        url: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=900&auto=format&fit=crop&q=80",
        title: "Rizières en terrasses de Tegalalang",
        city: "Ubud",
        date: "8 Août 2023",
        caption: "Verdure luxuriante baignée par la brume matinale.",
        likes: 45,
      },
    ],
    stories: [
      {
        id: "st-id-1",
        title: "Cérémonie traditionnelle balinaise",
        city: "Ubud",
        category: "Culture",
        date: "Août 2023",
        notes: "Offrandes florales, sons de gamelan et hospitalité extraordinaire.",
        icon: "🌺",
      },
    ],
  },
  {
    name: "Vietnam",
    frenchName: "Vietnam",
    flag: "🇻🇳",
    continent: "Asia",
    year: 2023,
    lat: 14.0583,
    lng: 108.2772,
    citiesCount: 3,
    memoriesCount: 9,
    visited: true,
    cities: [
      { name: "Hanoï", lat: 21.0285, lng: 105.8542, visitedYear: 2023 },
      { name: "Hoi An", lat: 15.8801, lng: 108.338, visitedYear: 2023 },
      { name: "Baie d'Ha Long", lat: 20.9101, lng: 107.1839, visitedYear: 2023 },
    ],
    photos: [
      {
        id: "vn-1",
        url: "https://images.unsplash.com/photo-1528127269322-539801943592?w=900&auto=format&fit=crop&q=80",
        title: "Pitons karstiques d'Ha Long",
        city: "Baie d'Ha Long",
        date: "15 Novembre 2023",
        caption: "Croisière en jonque traditionnelle entre les îles émeraude.",
        likes: 62,
      },
    ],
    stories: [
      {
        id: "st-vn-1",
        title: "Soirée des lanternes magiques",
        city: "Hoi An",
        category: "Culture",
        date: "Novembre 2023",
        notes: "Mille lampions illuminant la rivière Thu Bon sous la pleine lune.",
        icon: "🏮",
      },
    ],
  },
  {
    name: "Spain",
    frenchName: "Espagne",
    flag: "🇪🇸",
    continent: "Europe",
    year: 2020,
    lat: 40.4637,
    lng: -3.7492,
    citiesCount: 3,
    memoriesCount: 9,
    visited: true,
    cities: [
      { name: "Barcelone", lat: 41.3851, lng: 2.1734, visitedYear: 2020 },
      { name: "Madrid", lat: 40.4168, lng: -3.7038, visitedYear: 2020 },
    ],
    photos: [
      {
        id: "es-1",
        url: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&auto=format&fit=crop&q=80",
        title: "Sagrada Família & Vitraux",
        city: "Barcelone",
        date: "14 Février 2020",
        caption: "L'art grandiose de Gaudí et ses jeux de lumière étincelants.",
        likes: 54,
      },
    ],
    stories: [
      {
        id: "st-es-1",
        title: "Tapas & Spectacle Flamenco",
        city: "Barcelone",
        category: "Gastronomie",
        date: "Février 2020",
        notes: "Ambiance festive du quartier gothique et paella savoureuse.",
        icon: "💃",
      },
    ],
  },
  {
    name: "Portugal",
    frenchName: "Portugal",
    flag: "🇵🇹",
    continent: "Europe",
    year: 2022,
    lat: 39.3999,
    lng: -8.2245,
    citiesCount: 2,
    memoriesCount: 7,
    visited: true,
    cities: [
      { name: "Lisbonne", lat: 38.7223, lng: -9.1393, visitedYear: 2022 },
      { name: "Porto", lat: 41.1579, lng: -8.6291, visitedYear: 2022 },
    ],
    photos: [
      {
        id: "pt-1",
        url: "https://images.unsplash.com/photo-1509840841025-9088ba78a826?w=900&auto=format&fit=crop&q=80",
        title: "Tram 28 & Ruelles de l'Alfama",
        city: "Lisbonne",
        date: "5 Juillet 2022",
        caption: "Ambiance rétro au son du Fado et azulejos typiques.",
        likes: 41,
      },
    ],
    stories: [
      {
        id: "st-pt-1",
        title: "Pastéis de Belém encore tièdes",
        city: "Lisbonne",
        category: "Gastronomie",
        date: "Juillet 2022",
        notes: "Dégustation de la recette secrète avec cannelle et sucre glace.",
        icon: "🥮",
      },
    ],
  },
  {
    name: "Germany",
    frenchName: "Allemagne",
    flag: "🇩🇪",
    continent: "Europe",
    year: 2020,
    lat: 51.1657,
    lng: 10.4515,
    citiesCount: 2,
    memoriesCount: 6,
    visited: true,
    cities: [
      { name: "Berlin", lat: 52.52, lng: 13.405, visitedYear: 2020 },
      { name: "Munich", lat: 48.1351, lng: 11.582, visitedYear: 2020 },
    ],
    photos: [
      {
        id: "de-1",
        url: "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=900&auto=format&fit=crop&q=80",
        title: "Porte de Brandebourg",
        city: "Berlin",
        date: "20 Janvier 2020",
        caption: "Symbole historique illuminé sous le ciel d'hiver.",
        likes: 36,
      },
    ],
    stories: [
      {
        id: "st-de-1",
        title: "Visite de l'East Side Gallery",
        city: "Berlin",
        category: "Culture",
        date: "Janvier 2020",
        notes: "Fresques murales emblématiques le long des vestiges du mur.",
        icon: "🎨",
      },
    ],
  },
  {
    name: "UK",
    frenchName: "Royaume-Uni",
    flag: "🇬🇧",
    continent: "Europe",
    year: 2019,
    lat: 55.3781,
    lng: -3.436,
    citiesCount: 2,
    memoriesCount: 5,
    visited: true,
    cities: [
      { name: "Londres", lat: 51.5074, lng: -0.1278, visitedYear: 2019 },
      { name: "Édimbourg", lat: 55.9533, lng: -3.1883, visitedYear: 2019 },
    ],
    photos: [
      {
        id: "uk-1",
        url: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900&auto=format&fit=crop&q=80",
        title: "Tower Bridge & Tamise",
        city: "Londres",
        date: "10 Octobre 2019",
        caption: "Panorama iconique avec bus rouges londoniens.",
        likes: 49,
      },
    ],
    stories: [
      {
        id: "st-uk-1",
        title: "Afternoon Tea traditionnel",
        city: "Londres",
        category: "Gastronomie",
        date: "Octobre 2019",
        notes: "Scones chauds, clotted cream et vue sur Covent Garden.",
        icon: "🫖",
      },
    ],
  },
  {
    name: "Greece",
    frenchName: "Grèce",
    flag: "🇬🇷",
    continent: "Europe",
    year: 2022,
    lat: 39.0742,
    lng: 21.8243,
    citiesCount: 3,
    memoriesCount: 8,
    visited: true,
    cities: [
      { name: "Athènes", lat: 37.9838, lng: 23.7275, visitedYear: 2022 },
      { name: "Santorin", lat: 36.3932, lng: 25.4615, visitedYear: 2022 },
    ],
    photos: [
      {
        id: "gr-1",
        url: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=900&auto=format&fit=crop&q=80",
        title: "Dômes bleus d'Oia",
        city: "Santorin",
        date: "18 Juin 2022",
        caption: "Coucher de soleil féérique sur la caldeira de Santorin.",
        likes: 74,
      },
    ],
    stories: [
      {
        id: "st-gr-1",
        title: "Coucher de soleil à Oia",
        city: "Santorin",
        category: "Nature",
        date: "Juin 2022",
        notes: "Applaudissements collectifs quand le soleil plonge dans la mer Égée.",
        icon: "🌅",
      },
    ],
  },
  {
    name: "Turkey",
    frenchName: "Turquie",
    flag: "🇹🇷",
    continent: "Asia",
    year: 2021,
    lat: 38.9637,
    lng: 35.2433,
    citiesCount: 2,
    memoriesCount: 7,
    visited: true,
    cities: [
      { name: "Istanbul", lat: 41.0082, lng: 28.9784, visitedYear: 2021 },
      { name: "Cappadoce", lat: 38.6431, lng: 34.8289, visitedYear: 2021 },
    ],
    photos: [
      {
        id: "tr-1",
        url: "https://images.unsplash.com/photo-1527838832700-5059252407fa?w=900&auto=format&fit=crop&q=80",
        title: "Montgolfières en Cappadoce",
        city: "Cappadoce",
        date: "25 Septembre 2021",
        caption: "Centaines de montgolfières s'élevant au-dessus des cheminées de fées.",
        likes: 79,
      },
    ],
    stories: [
      {
        id: "st-tr-1",
        title: "Vol en montgolfière à l'aube",
        city: "Cappadoce",
        category: "Aventure",
        date: "Septembre 2021",
        notes: "Vue panoramique à 360° sur les vallées lunaires.",
        icon: "🎈",
      },
    ],
  },
  {
    name: "Kenya",
    frenchName: "Kenya",
    flag: "🇰🇪",
    continent: "Africa",
    year: 2020,
    lat: -0.0236,
    lng: 37.9062,
    citiesCount: 2,
    memoriesCount: 6,
    visited: true,
    cities: [
      { name: "Nairobi", lat: -1.2921, lng: 36.8219, visitedYear: 2020 },
      { name: "Masai Mara", lat: -1.5, lng: 35.2, visitedYear: 2020 },
    ],
    photos: [
      {
        id: "ke-1",
        url: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=900&auto=format&fit=crop&q=80",
        title: "Safari dans la savane du Masai Mara",
        city: "Masai Mara",
        date: "12 Janvier 2020",
        caption: "Rencontre magique avec les lions et éléphants au soleil couchant.",
        likes: 67,
      },
    ],
    stories: [
      {
        id: "st-ke-1",
        title: "Safari Big Five",
        city: "Masai Mara",
        category: "Nature",
        date: "Janvier 2020",
        notes: "Observation privilégiée d'une famille de guépards en pleine chasse.",
        icon: "🦁",
      },
    ],
  },
  {
    name: "South Africa",
    frenchName: "Afrique du Sud",
    flag: "🇿🇦",
    continent: "Africa",
    year: 2019,
    lat: -30.5595,
    lng: 22.9375,
    citiesCount: 2,
    memoriesCount: 5,
    visited: true,
    cities: [
      { name: "Le Cap", lat: -33.9249, lng: 18.4241, visitedYear: 2019 },
      { name: "Johannesburg", lat: -26.2041, lng: 28.0473, visitedYear: 2019 },
    ],
    photos: [
      {
        id: "za-1",
        url: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=900&auto=format&fit=crop&q=80",
        title: "Table Mountain & Plage des Boulders",
        city: "Le Cap",
        date: "5 Novembre 2019",
        caption: "Manchots sauvages sur le sable blanc du Cap.",
        likes: 58,
      },
    ],
    stories: [
      {
        id: "st-za-1",
        title: "Ascension de Lion's Head",
        city: "Le Cap",
        category: "Aventure",
        date: "Novembre 2019",
        notes: "Vue spectaculaire sur l'océan Atlantique et la ville illuminée.",
        icon: "🧗",
      },
    ],
  },
  {
    name: "India",
    frenchName: "Inde",
    flag: "🇮🇳",
    continent: "Asia",
    year: 2022,
    lat: 20.5937,
    lng: 78.9629,
    citiesCount: 3,
    memoriesCount: 8,
    visited: true,
    cities: [
      { name: "New Delhi", lat: 28.6139, lng: 77.209, visitedYear: 2022 },
      { name: "Agra", lat: 27.1767, lng: 78.0081, visitedYear: 2022 },
      { name: "Jaipur", lat: 26.9124, lng: 75.7873, visitedYear: 2022 },
    ],
    photos: [
      {
        id: "in-1",
        url: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900&auto=format&fit=crop&q=80",
        title: "Taj Mahal au lever du soleil",
        city: "Agra",
        date: "14 Décembre 2022",
        caption: "Marbre blanc étincelant reflété dans les bassins sacrés.",
        likes: 83,
      },
    ],
    stories: [
      {
        id: "st-in-1",
        title: "Palais des Vents (Hawa Mahal)",
        city: "Jaipur",
        category: "Culture",
        date: "Décembre 2022",
        notes: "Façade de grès rose et histoire fascinante des maharajas du Rajasthan.",
        icon: "🕌",
      },
    ],
  },
  {
    name: "Nepal",
    frenchName: "Népal",
    flag: "🇳🇵",
    continent: "Asia",
    year: 2022,
    lat: 28.3949,
    lng: 84.124,
    citiesCount: 1,
    memoriesCount: 4,
    visited: true,
    cities: [{ name: "Katmandou", lat: 27.7172, lng: 85.324, visitedYear: 2022 }],
    photos: [
      {
        id: "np-1",
        url: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=900&auto=format&fit=crop&q=80",
        title: "Drapeaux de prières & Temple Swayambhunath",
        city: "Katmandou",
        date: "20 Décembre 2022",
        caption: "Spiritualité himalayenne et vue sur les sommets enneigés.",
        likes: 52,
      },
    ],
    stories: [
      {
        id: "st-np-1",
        title: "Vue sur l'Everest depuis Nagarkot",
        city: "Katmandou",
        category: "Nature",
        date: "Décembre 2022",
        notes: "Lever de soleil sur la chaîne de l'Himalaya, moment suspendu.",
        icon: "🏔️",
      },
    ],
  },
  {
    name: "USA",
    frenchName: "États-Unis",
    flag: "🇺🇸",
    continent: "Americas",
    year: 2020,
    lat: 37.0902,
    lng: -95.7129,
    citiesCount: 4,
    memoriesCount: 14,
    visited: true,
    cities: [
      { name: "New York", lat: 40.7128, lng: -74.006, visitedYear: 2020 },
      { name: "San Francisco", lat: 37.7749, lng: -122.4194, visitedYear: 2020 },
      { name: "Grand Canyon", lat: 36.0544, lng: -112.1401, visitedYear: 2020 },
    ],
    photos: [
      {
        id: "us-1",
        url: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=900&auto=format&fit=crop&q=80",
        title: "Skyline de Manhattan depuis Brooklyn",
        city: "New York",
        date: "10 Septembre 2020",
        caption: "Gratte-ciels illuminés et pont de Brooklyn au crépuscule.",
        likes: 65,
      },
    ],
    stories: [
      {
        id: "st-us-1",
        title: "Randonnée le long du South Rim",
        city: "Grand Canyon",
        category: "Nature",
        date: "Septembre 2020",
        notes: "L'immensité vertigineuse des canyons sculptés par le Colorado.",
        icon: "🏜️",
      },
    ],
  },
  {
    name: "Mexico",
    frenchName: "Mexique",
    flag: "🇲🇽",
    continent: "Americas",
    year: 2021,
    lat: 23.6345,
    lng: -102.5528,
    citiesCount: 2,
    memoriesCount: 6,
    visited: true,
    cities: [
      { name: "Mexico City", lat: 19.4326, lng: -99.1332, visitedYear: 2021 },
      { name: "Tulum", lat: 20.2114, lng: -87.4654, visitedYear: 2021 },
    ],
    photos: [
      {
        id: "mx-1",
        url: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=900&auto=format&fit=crop&q=80",
        title: "Ruines Mayas de Tulum face aux Caraïbes",
        city: "Tulum",
        date: "22 Novembre 2021",
        caption: "Pyramides perchées au-dessus des eaux turquoise caribéennes.",
        likes: 61,
      },
    ],
    stories: [
      {
        id: "st-mx-1",
        title: "Baignade dans les Cenotes sacrés",
        city: "Tulum",
        category: "Aventure",
        date: "Novembre 2021",
        notes: "Eaux cristallines souterraines sous les racines des arbres tropicaux.",
        icon: "🏊",
      },
    ],
  },
  {
    name: "Colombia",
    frenchName: "Colombie",
    flag: "🇨🇴",
    continent: "Americas",
    year: 2023,
    lat: 4.5709,
    lng: -74.2973,
    citiesCount: 2,
    memoriesCount: 5,
    visited: true,
    cities: [
      { name: "Carthagène", lat: 10.391, lng: -75.4794, visitedYear: 2023 },
      { name: "Medellín", lat: 6.2442, lng: -75.5812, visitedYear: 2023 },
    ],
    photos: [
      {
        id: "co-1",
        url: "https://images.unsplash.com/photo-1583531352515-8884af319dc1?w=900&auto=format&fit=crop&q=80",
        title: "Balcons fleuris de Carthagène des Indes",
        city: "Carthagène",
        date: "4 Mai 2023",
        caption: "Façades coloniales colorées et musique salsa dans les rues.",
        likes: 48,
      },
    ],
    stories: [
      {
        id: "st-co-1",
        title: "Dégustation de café dans la région de Quindío",
        city: "Medellín",
        category: "Gastronomie",
        date: "Mai 2023",
        notes: "Visite d'une finca traditionnelle et secrets de torréfaction.",
        icon: "☕",
      },
    ],
  },
  {
    name: "Peru",
    frenchName: "Pérou",
    flag: "🇵🇪",
    continent: "Americas",
    year: 2023,
    lat: -9.19,
    lng: -75.0152,
    citiesCount: 2,
    memoriesCount: 6,
    visited: true,
    cities: [
      { name: "Cusco", lat: -13.5319, lng: -71.9675, visitedYear: 2023 },
      { name: "Machu Picchu", lat: -13.1631, lng: -72.545, visitedYear: 2023 },
    ],
    photos: [
      {
        id: "pe-1",
        url: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=900&auto=format&fit=crop&q=80",
        title: "Cité perdue du Machu Picchu",
        city: "Machu Picchu",
        date: "14 Mai 2023",
        caption: "Sanctuaire inca mystique perché entre les nuages et les cimes andines.",
        likes: 92,
      },
    ],
    stories: [
      {
        id: "st-pe-1",
        title: "Trek de la Vallée Sacrée",
        city: "Cusco",
        category: "Aventure",
        date: "Mai 2023",
        notes: "Rencontre avec les alpagas et découverte des terrasses agricoles de Moray.",
        icon: "🦙",
      },
    ],
  },
  {
    name: "Australia",
    frenchName: "Australie",
    flag: "🇦🇺",
    continent: "Oceania",
    year: 2021,
    lat: -25.2744,
    lng: 133.7751,
    citiesCount: 2,
    memoriesCount: 7,
    visited: true,
    cities: [
      { name: "Sydney", lat: -33.8688, lng: 151.2093, visitedYear: 2021 },
      { name: "Melbourne", lat: -37.8136, lng: 144.9631, visitedYear: 2021 },
    ],
    photos: [
      {
        id: "au-1",
        url: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=900&auto=format&fit=crop&q=80",
        title: "Opéra de Sydney & Harbour Bridge",
        city: "Sydney",
        date: "18 Décembre 2021",
        caption: "Architecture voilière iconique au bord de la baie scintillante.",
        likes: 68,
      },
    ],
    stories: [
      {
        id: "st-au-1",
        title: "Surf à Bondi Beach",
        city: "Sydney",
        category: "Aventure",
        date: "Décembre 2021",
        notes: "Session matinale dans les vagues du Pacifique avec les locaux.",
        icon: "🏄‍♂️",
      },
    ],
  },
]

const CONTINENTS = ["All", "Europe", "Asia", "Africa", "Americas", "Oceania"] as const

const CONTINENT_COLORS: Record<string, string> = {
  Europe: "#4F46E5",
  Asia: "#06C4D4",
  Africa: "#FF6347",
  Americas: "#10B981",
  Oceania: "#F59E0B",
}

const CONTINENT_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  All: { lat: 20, lng: 10, zoom: 1.8 },
  Europe: { lat: 48, lng: 14, zoom: 4 },
  Asia: { lat: 30, lng: 90, zoom: 3.2 },
  Africa: { lat: 2, lng: 20, zoom: 3.2 },
  Americas: { lat: 10, lng: -75, zoom: 2.8 },
  Oceania: { lat: -25, lng: 135, zoom: 3.5 },
}

// Name matching helper between GeoJSON feature and a country list.
function findCountryMatch(featureName: string, list: Country[]): Country | undefined {
  if (!featureName) return undefined
  const clean = featureName.trim().toLowerCase()
  return list.find((c) => {
    const cName = c.name.toLowerCase()
    const frName = c.frenchName.toLowerCase()
    if (clean === cName || clean === frName) return true
    if (c.name === "USA" && (clean.includes("united states") || clean === "usa" || clean === "us")) return true
    if (c.name === "UK" && (clean.includes("united kingdom") || clean === "uk" || clean.includes("britain"))) return true
    if (c.name === "South Africa" && clean.includes("south africa")) return true
    if (clean.includes(cName) || cName.includes(clean)) return true
    return false
  })
}

// ── Dynamic visited countries (built from the user's own trips) ────────────
// A trip lands on the world map once it is over (end_date in the past) or
// carries no future start date — each destination is geocoded independently
// so every pin sits on its real city.

const WORLD_PHOTOS_KEY = "trypo_world_photos_v1"

function normCountryKey(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

/**
 * Strip ALL emoji — including flag regional indicators (🇹🇳) that a narrow
 * range-regex misses — plus any junk, keeping only a plain country name.
 * "Tunisie 🇹🇳" → "Tunisie", "Spain" → "Spain".
 */
function cleanCountryName(raw: string): string {
  return (raw || "")
    .replace(/[^\p{L}\p{M}\s\-']/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** French labels → GeoJSON English names (world-countries.json is English). */
const ENGLISH_BY_KEY: Record<string, string> = {
  tunisie: "Tunisia",
  maroc: "Morocco",
  algerie: "Algeria",
  egypte: "Egypt",
  espagne: "Spain",
  italie: "Italy",
  grece: "Greece",
  turquie: "Turkey",
  allemagne: "Germany",
  angleterre: "United Kingdom",
  belgique: "Belgium",
  suisse: "Switzerland",
  autriche: "Austria",
  hongrie: "Hungary",
  croatie: "Croatia",
  pologne: "Poland",
  roumanie: "Romania",
  suede: "Sweden",
  norvege: "Norway",
  danemark: "Denmark",
  finlande: "Finland",
  islande: "Iceland",
  irlande: "Ireland",
  japon: "Japan",
  chine: "China",
  inde: "India",
  thailande: "Thailand",
  vietnam: "Vietnam",
  indonesie: "Indonesia",
  coree: "South Korea",
  tchequie: "Czech Republic",
  mexique: "Mexico",
  bresil: "Brazil",
  colombie: "Colombia",
  perou: "Peru",
  argentine: "Argentina",
  australie: "Australia",
  "etats-unis": "United States of America",
}

function readWorldPhotos(): Record<string, MemoryPhoto[]> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(WORLD_PHOTOS_KEY) : null
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

const FLAG_BY_COUNTRY: Record<string, string> = {
  france: "🇫🇷", spain: "🇪🇸", espagne: "🇪🇸", italy: "🇮🇹", italie: "🇮🇹",
  portugal: "🇵🇹", germany: "🇩🇪", allemagne: "🇩🇪", uk: "🇬🇧", "united kingdom": "🇬🇧",
  greece: "🇬🇷", grece: "🇬🇷", turkey: "🇹🇷", turquie: "🇹🇷", morocco: "🇲🇦", maroc: "🇲🇦",
  tunisia: "🇹🇳", tunisie: "🇹🇳", algeria: "🇩🇿", algerie: "🇩🇿", egypt: "🇪🇬", egypte: "🇪🇬",
  kenya: "🇰🇪", "south africa": "🇿🇦", japan: "🇯🇵", japon: "🇯🇵", india: "🇮🇳", inde: "🇮🇳",
  nepal: "🇳🇵", vietnam: "🇻🇳", indonesia: "🇮🇩", indonesie: "🇮🇩", usa: "🇺🇸",
  "united states": "🇺🇸", mexico: "🇲🇽", mexique: "🇲🇽", colombia: "🇨🇴", colombie: "🇨🇴",
  peru: "🇵🇪", perou: "🇵🇪", australia: "🇦🇺", australie: "🇦🇺", canada: "🇨🇦",
  brazil: "🇧🇷", bresil: "🇧🇷", argentina: "🇦🇷", argentine: "🇦🇷", thailand: "🇹🇭",
  thailande: "🇹🇭", netherlands: "🇳🇱", austria: "🇦🇹", autriche: "🇦🇹", belgium: "🇧🇪",
  belgique: "🇧🇪", switzerland: "🇨🇭", suisse: "🇨🇭", croatia: "🇭🇷", croatie: "🇭🇷",
  "czech republic": "🇨🇿", czechia: "🇨🇿", hungary: "🇭🇺", hongrie: "🇭🇺",
  poland: "🇵🇱", pologne: "🇵🇱", ireland: "🇮🇪", irlande: "🇮🇪", norway: "🇳🇴",
  norvege: "🇳🇴", sweden: "🇸🇪", suede: "🇸🇪", denmark: "🇩🇰", danemark: "🇩🇰",
  finland: "🇫🇮", finlande: "🇫🇮", iceland: "🇮🇸", islande: "🇮🇸",
  china: "🇨🇳", chine: "🇨🇳", "south korea": "🇰🇷",
  chile: "🇨🇱",
  malaysia: "🇲🇾", singapore: "🇸🇬", philippines: "🇵🇭",
  "saudi arabia": "🇸🇦", "united arab emirates": "🇦🇪", qatar: "🇶🇦",
  nigeria: "🇳🇬", ghana: "🇬🇭", senegal: "🇸🇳", ethiopia: "🇪🇹",
  romania: "🇷🇴", ukraine: "🇺🇦", russia: "🇷🇺",
  israel: "🇮🇱", jordan: "🇯🇴", lebanon: "🇱🇧", "new zealand": "🇳🇿",
  tanzania: "🇹🇿", madagascar: "🇲🇬", libya: "🇱🇾", libye: "🇱🇾",
}

/** Static name → coordinates, used to place pins for legacy manual entries
 *  that were stored before lat/lng were persisted. */
const COUNTRY_COORDS_BY_KEY: Record<string, { lat: number; lng: number }> = Object.fromEntries(
  COUNTRIES.map((c) => [normCountryKey(c.name), { lat: c.lat, lng: c.lng }]),
)

const CONTINENT_BY_COUNTRY: Record<string, Country["continent"]> = {
  france: "Europe", spain: "Europe", espagne: "Europe", italy: "Europe", italie: "Europe",
  portugal: "Europe", germany: "Europe", allemagne: "Europe", uk: "Europe",
  "united kingdom": "Europe", greece: "Europe", grece: "Europe", netherlands: "Europe",
  austria: "Europe", autriche: "Europe", belgium: "Europe", belgique: "Europe",
  switzerland: "Europe", suisse: "Europe", croatia: "Europe", croatie: "Europe",
  japan: "Asia", japon: "Asia", india: "Asia", inde: "Asia", nepal: "Asia",
  vietnam: "Asia", indonesia: "Asia", indonesie: "Asia", turkey: "Asia", turquie: "Asia",
  thailand: "Asia", thailande: "Asia",
  tunisia: "Africa", tunisie: "Africa", morocco: "Africa", maroc: "Africa",
  algeria: "Africa", algerie: "Africa", egypt: "Africa", egypte: "Africa",
  kenya: "Africa", "south africa": "Africa",
  usa: "Americas", "united states": "Americas", mexico: "Americas", mexique: "Americas",
  colombia: "Americas", colombie: "Americas", peru: "Americas", perou: "Americas",
  canada: "Americas", brazil: "Americas", bresil: "Americas",
  australia: "Oceania", australie: "Oceania",
  china: "Asia", chine: "Asia", "south korea": "Asia", "czech republic": "Europe",
  // Extended so a manually checked country lands on the right continent tab.
  "united states of america": "Americas",
  argentine: "Americas", chile: "Americas", venezuela: "Americas", ecuador: "Americas",
  bolivia: "Americas", paraguay: "Americas", uruguay: "Americas", cuba: "Americas",
  jamaica: "Americas", haiti: "Americas", "dominican republic": "Americas",
  "costa rica": "Americas", panama: "Americas", guatemala: "Americas",
  honduras: "Americas", nicaragua: "Americas", "el salvador": "Americas",
  bahamas: "Americas", greenland: "Americas",
  malaysia: "Asia", singapore: "Asia", philippines: "Asia", cambodia: "Asia",
  laos: "Asia", myanmar: "Asia", "sri lanka": "Asia", pakistan: "Asia",
  bangladesh: "Asia", mongolia: "Asia", kazakhstan: "Asia", uzbekistan: "Asia",
  georgia: "Asia", armenia: "Asia", azerbaijan: "Asia", israel: "Asia",
  jordan: "Asia", lebanon: "Asia", "saudi arabia": "Asia",
  "united arab emirates": "Asia", qatar: "Asia", kuwait: "Asia", oman: "Asia",
  yemen: "Asia", iraq: "Asia", iran: "Asia", russia: "Asia",
  "north korea": "Asia", taiwan: "Asia", "hong kong": "Asia",
  libya: "Africa", libye: "Africa", sudan: "Africa", ethiopia: "Africa",
  somalia: "Africa", djibouti: "Africa", eritrea: "Africa", chad: "Africa",
  niger: "Africa", mali: "Africa", "burkina faso": "Africa", senegal: "Africa",
  mauritania: "Africa", gambia: "Africa", "guinea-bissau": "Africa",
  guinea: "Africa", "sierra leone": "Africa", liberia: "Africa",
  "ivory coast": "Africa", "côte d'ivoire": "Africa", ghana: "Africa",
  togo: "Africa", benin: "Africa", nigeria: "Africa", cameroon: "Africa",
  "central african republic": "Africa", "south sudan": "Africa", uganda: "Africa",
  rwanda: "Africa", burundi: "Africa", tanzania: "Africa", congo: "Africa",
  "democratic republic of the congo": "Africa", gabon: "Africa", angola: "Africa",
  namibia: "Africa", botswana: "Africa", zimbabwe: "Africa", mozambique: "Africa",
  malawi: "Africa", zambia: "Africa", lesotho: "Africa", eswatini: "Africa",
  madagascar: "Africa", mauritius: "Africa", seychelles: "Africa",
  "cape verde": "Africa", comoros: "Africa", "sao tome and principe": "Africa",
  albania: "Europe", serbia: "Europe", "bosnia and herzegovina": "Europe",
  montenegro: "Europe", "north macedonia": "Europe", slovenia: "Europe",
  slovakia: "Europe", romania: "Europe", bulgaria: "Europe", moldova: "Europe",
  ukraine: "Europe", belarus: "Europe", lithuania: "Europe", latvia: "Europe",
  estonia: "Europe", luxembourg: "Europe", malta: "Europe", cyprus: "Europe",
  andorra: "Europe", monaco: "Europe", liechtenstein: "Europe",
  "san marino": "Europe", vatican: "Europe",
  "new zealand": "Oceania", fiji: "Oceania", "papua new guinea": "Oceania",
  "new caledonia": "Oceania", "french polynesia": "Oceania", samoa: "Oceania",
  tonga: "Oceania", vanuatu: "Oceania",
}

function finiteCoord(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n !== 0 ? n : null
}

// ── Manually checked countries ("I was here", tapped on the map) ───────────
// Stored per device in localStorage and merged with the automatic trip-based
// countries. A manual entry never disappears: trips only ADD countries.

const MANUAL_VISITED_KEY = "trypo_manual_visited_v1"

/** How long each story photo stays on screen. */
const STORY_DURATION_MS = 5000

type ManualEntry = {
  name: string
  frenchName: string
  flag: string
  continent: Country["continent"]
  year: number
  /** Coordinates captured at check time so the map pin can fly to the country. */
  lat?: number
  lng?: number
}

function readManualVisited(): Record<string, ManualEntry> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(MANUAL_VISITED_KEY) : null
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeManualVisited(next: Record<string, ManualEntry>): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(MANUAL_VISITED_KEY, JSON.stringify(next))
  } catch {}
}

/** English GeoJSON name → French label (best effort, capitalized key). */
function frenchLabelFor(englishName: string, normKey: string): string {
  for (const [frKey, en] of Object.entries(ENGLISH_BY_KEY)) {
    if (normCountryKey(en) === normKey) {
      return frKey.charAt(0).toUpperCase() + frKey.slice(1)
    }
  }
  return englishName
}

/** Build a transient (not yet visited) country from a tapped GeoJSON feature. */
function buildUnvisitedCountry(geoName: string, lng: number, lat: number): Country {
  const key = normCountryKey(geoName)
  return {
    name: geoName,
    frenchName: frenchLabelFor(geoName, key),
    flag: FLAG_BY_COUNTRY[key] || "🏳️",
    continent: CONTINENT_BY_COUNTRY[key] || "Europe",
    year: new Date().getFullYear(),
    lat,
    lng,
    citiesCount: 0,
    memoriesCount: 0,
    visited: false,
    cities: [],
    photos: [],
    stories: [],
  }
}

/** Build visited countries from the user's trips (passed trips → on the map). */
async function buildDynamicCountries(): Promise<Country[]> {
  let trips: any[] = []
  try {
    trips = (await getMyTrips()) || []
  } catch {
    return []
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const byCountry = new Map<string, Country>()

  for (const trip of trips) {
    const dests = Array.isArray(trip?.trip_destinations) ? trip.trip_destinations : []
    if (dests.length === 0) continue
    // Only trips that are over (or underway/undated) — future trips stay off.
    const start = trip?.start_date ? new Date(`${String(trip.start_date).slice(0, 10)}T00:00:00`) : null
    if (start && !Number.isNaN(start.getTime()) && start.getTime() > today.getTime()) continue
    const end = trip?.end_date ? new Date(`${String(trip.end_date).slice(0, 10)}T00:00:00`) : null
    const year = end && !Number.isNaN(end.getTime())
      ? end.getFullYear()
      : start && !Number.isNaN(start.getTime())
        ? start.getFullYear()
        : new Date().getFullYear()

    for (const d of dests) {
      const city = String(d?.city || "").trim()
      if (!city) continue
      // Each destination geocoded independently — never inherits a sibling pin.
      let lat = finiteCoord(d?.lat)
      let lng = finiteCoord(d?.lng)
      let countryName = String(d?.country || "").trim()
      const known = resolveKnownCoords(city)
      if ((lat === null || lng === null) && known) {
        lat = known.lat
        lng = known.lng
        if (!countryName || countryName === "Destination") countryName = known.country
      }
      if (lat === null || lng === null) {
        const firstToken = city.split(",")[0].trim()
        for (const q of firstToken !== city ? [firstToken, city] : [city]) {
          try {
            const live = await resolveCityCoordsLive(q)
            if (live && Number.isFinite(live.lat) && Number.isFinite(live.lng)) {
              lat = live.lat
              lng = live.lng
              if ((!countryName || countryName === "Destination") && live.country) countryName = live.country
              break
            }
          } catch {}
        }
      }
      if (lat === null || lng === null) continue
      // Normalize labels to a plain country name ("Tunisie 🇹🇳" → "Tunisie").
      // The old regex missed flag emoji (regional indicators), so the lookup
      // fell through to continent "Europe" and the map never colored Tunisia.
      countryName = cleanCountryName(countryName) || city
      if (/^(destination|unknown|monde)$/i.test(countryName)) countryName = city
      // A label that is actually a city (trip saved the city as country)
      // resolves to its real country so flags/continents still match.
      const cityAsCountry = resolveKnownCoords(countryName)
      if (cityAsCountry) countryName = cleanCountryName(cityAsCountry.country) || countryName
      const key = normCountryKey(countryName)
      // French + English spellings of one country share a single entry,
      // stored under the English name so the GeoJSON match always hits.
      const englishName = ENGLISH_BY_KEY[key] || countryName
      const groupKey = normCountryKey(englishName)
      let entry = byCountry.get(groupKey)
      if (!entry) {
        entry = {
          name: englishName,
          frenchName: countryName,
          flag: FLAG_BY_COUNTRY[groupKey] || FLAG_BY_COUNTRY[key] || "🏳️",
          continent: CONTINENT_BY_COUNTRY[groupKey] || CONTINENT_BY_COUNTRY[key] || "Europe",
          year,
          lat,
          lng,
          citiesCount: 0,
          memoriesCount: 0,
          visited: true,
          cities: [],
          photos: [],
          stories: [],
        }
        byCountry.set(groupKey, entry)
      }
      if (!entry.cities.some((c) => c.name.toLowerCase() === city.toLowerCase())) {
        entry.cities.push({ name: city, lat, lng, visitedYear: year })
      }
      entry.year = Math.max(entry.year, year)
    }
  }

  // Centroid per country so the map flies to the middle of its cities.
  for (const entry of byCountry.values()) {
    if (entry.cities.length > 0) {
      entry.lat = entry.cities.reduce((s, c) => s + c.lat, 0) / entry.cities.length
      entry.lng = entry.cities.reduce((s, c) => s + c.lng, 0) / entry.cities.length
      entry.citiesCount = entry.cities.length
    }
  }
  return [...byCountry.values()]
}

export default function WorldMapScreen({ navigate, goBack }: Props) {
  const { user } = useAuth()
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Explorer"
  // The traveler's own face — shown on every visited country pin.
  const myAvatar = useMyAvatar()
  const avatarRef = useRef(myAvatar)
  avatarRef.current = myAvatar
  // Empty by default: only the user's own passed trips color the map.
  const isDesktop = useIsDesktop()
  const [selected, setSelected] = useState<Country | null>(null)
  const [activeContinent, setActiveContinent] = useState<string>("All")
  const [layerType] = useState<MapboxStyleKey>("trypo")

  // Memories & Photos Modal state
  const [showMemoriesModal, setShowMemoriesModal] = useState<boolean>(false)
  const [modalCountry, setModalCountry] = useState<Country | null>(null)
  const [activeModalTab, setActiveModalTab] = useState<"photos" | "stories" | "cities">("photos")
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>("All")
  const [storyIndex, setStoryIndex] = useState<number | null>(null)
  const [storyElapsed, setStoryElapsed] = useState(0)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const cityMarkersRef = useRef<mapboxgl.Marker[]>([])
  const selectedRef = useRef<Country | null>(null)
  const geoJsonDataRef = useRef<any>(null)
  const mapLoadedRef = useRef(false)
  selectedRef.current = selected

  // ── Dynamic world: user's own passed trips + uploaded phone photos ──
  const [dynamicCountries, setDynamicCountries] = useState<Country[]>([])
  const [worldPhotos, setWorldPhotos] = useState<Record<string, MemoryPhoto[]>>(() => readWorldPhotos())
  // Countries the user checked manually by tapping the map.
  const [manualVisited, setManualVisited] = useState<Record<string, ManualEntry>>(() => readManualVisited())
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const worldFileRef = useRef<HTMLInputElement>(null)
  const modalCountryForUpload = useRef<Country | null>(null)

  const markCountryVisited = (c: Country) => {
    const key = normCountryKey(c.name)
    const entry: ManualEntry = {
      name: c.name,
      frenchName: c.frenchName || c.name,
      flag: c.flag || "🏳️",
      continent: c.continent || "Europe",
      year: new Date().getFullYear(),
      lat: c.lat,
      lng: c.lng,
    }
    setManualVisited((prev) => {
      const next = { ...prev, [key]: entry }
      writeManualVisited(next)
      return next
    })
  }

  const unmarkCountryVisited = (c: Country) => {
    const key = normCountryKey(c.name)
    setManualVisited((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      writeManualVisited(next)
      return next
    })
    setSelected(null)
  }

  useEffect(() => {
    let alive = true
    const load = async () => {
      const dyn = await buildDynamicCountries()
      if (alive) setDynamicCountries(dyn)
    }
    void load()
    const onDb = () => void load()
    window.addEventListener("trypo:db_changed", onDb)
    return () => {
      alive = false
      window.removeEventListener("trypo:db_changed", onDb)
    }
  }, [])

  /** Only the user's own trips color the map — no demo countries.
   * Passed/underway trips merged with manually checked countries and
   * uploaded phone photos. */
  const allCountries = useMemo<Country[]>(() => {
    const byKey = new Map<string, Country>()
    for (const d of dynamicCountries) {
      const key = normCountryKey(d.name)
      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, d)
        continue
      }
      const cities = [...prev.cities]
      for (const city of d.cities) {
        if (!cities.some((c) => c.name.toLowerCase() === city.name.toLowerCase())) cities.push(city)
      }
      byKey.set(key, {
        ...prev,
        cities,
        citiesCount: cities.length,
        year: Math.max(prev.year, d.year),
      })
    }
    // Manually checked countries join the map (trip entries win on collision).
    for (const entry of Object.values(manualVisited)) {
      const key = normCountryKey(entry.name)
      if (!byKey.has(key)) {
        byKey.set(key, {
          ...entry,
          lat: entry.lat ?? COUNTRY_COORDS_BY_KEY[key]?.lat ?? 0,
          lng: entry.lng ?? COUNTRY_COORDS_BY_KEY[key]?.lng ?? 0,
          citiesCount: 0,
          memoriesCount: 0,
          visited: true,
          manual: true,
          cities: [],
          photos: [],
          stories: [],
        })
      }
    }
    // Uploaded phone photos attach to their country (first = newest).
    for (const c of byKey.values()) {
      const mine = worldPhotos[normCountryKey(c.name)] || []
      if (mine.length > 0) {
        c.photos = [...mine, ...c.photos]
        c.memoriesCount = c.photos.length + c.stories.length
      }
    }
    return [...byKey.values()]
  }, [dynamicCountries, manualVisited, worldPhotos])

  const countriesRef = useRef<Country[]>(allCountries)
  countriesRef.current = allCountries

  // ── Profile-photo pins: the user's face on every visited country ──
  const avatarMarkersRef = useRef<mapboxgl.Marker[]>([])
  const renderAvatarsRef = useRef<() => void>(() => {})

  renderAvatarsRef.current = () => {
    avatarMarkersRef.current.forEach((m) => m.remove())
    avatarMarkersRef.current = []
    const map = mapInstanceRef.current
    const list = countriesRef.current.filter((c) => c.visited)
    if (!map || !mapLoadedRef.current || list.length === 0) return
    const sel = selectedRef.current
    const avatar = avatarRef.current
    list.forEach((country) => {
      const isSel = sel?.name === country.name
      const color = CONTINENT_COLORS[country.continent] || "#4F46E5"
      const el = document.createElement("div")
      el.className = "trypo-avatar-pin"
      el.style.width = isSel ? "44px" : "34px"
      el.style.height = isSel ? "44px" : "34px"
      el.style.borderRadius = "50%"
      el.style.overflow = "hidden"
      el.style.cursor = "pointer"
      el.style.border = "2px solid #fff"
      el.style.boxShadow = isSel
        ? `0 0 0 3px ${color}, 0 0 0 6px rgba(255,255,255,0.35), 0 6px 16px rgba(0,0,0,0.5)`
        : `0 0 0 2px ${color}, 0 4px 10px rgba(0,0,0,0.45)`
      el.style.zIndex = isSel ? "20" : "10"
      const img = document.createElement("img")
      img.src = avatar
      img.alt = country.frenchName
      img.style.width = "100%"
      img.style.height = "100%"
      img.style.objectFit = "cover"
      el.appendChild(img)
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        setSelected(country)
        map.flyTo({ center: [country.lng, country.lat], zoom: 5, duration: 1200 })
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([country.lng, country.lat])
        .addTo(map)
      avatarMarkersRef.current.push(marker)
    })
  }

  // Re-render avatar pins when countries, selection or photo change.
  useEffect(() => {
    renderAvatarsRef.current()
  }, [allCountries, selected, myAvatar])

  // Keep the open card/modal in sync when uploads or trips refresh the list.
  useEffect(() => {
    if (modalCountry) {
      const fresh = allCountries.find((c) => c.name === modalCountry.name)
      if (fresh && fresh !== modalCountry) setModalCountry(fresh)
    }
    if (selected) {
      const freshSel = allCountries.find((c) => c.name === selected.name)
      if (freshSel && freshSel !== selected) setSelected(freshSel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCountries])

  /** Upload a phone photo (camera or gallery) to the selected country. */
  const handleWorldPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    const target = modalCountryForUpload.current || selectedRef.current
    if (!file || !target) return
    setUploadingPhoto(true)
    try {
      const url = await processAvatarFile(file, 800)
      const city = selectedCityFilter !== "All" ? selectedCityFilter : target.cities[0]?.name || target.frenchName
      const photo: MemoryPhoto = {
        id: `mine-${Date.now()}`,
        url,
        title: city,
        city,
        date: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
        caption: "My travel memory 📸",
        likes: 0,
      }
      const key = normCountryKey(target.name)
      setWorldPhotos((prev) => {
        const next = { ...prev, [key]: [photo, ...(prev[key] || [])] }
        try {
          localStorage.setItem(WORLD_PHOTOS_KEY, JSON.stringify(next))
        } catch {}
        return next
      })
    } catch {
      // ignore unreadable files
    } finally {
      setUploadingPhoto(false)
    }
  }

  const visited = allCountries.filter((c) => c.visited)
  const filtered =
    activeContinent === "All"
      ? visited
      : visited.filter((c) => c.continent === activeContinent)

  const totalMemories = visited.reduce((acc, c) => acc + c.photos.length + c.stories.length, 0)
  const totalCities = visited.reduce((acc, c) => acc + c.cities.length, 0)

  // Open modal with specific country or overall
  const handleOpenMemories = (country?: Country) => {
    const target = country || selected
    if (!target) return
    setModalCountry(target)
    modalCountryForUpload.current = target
    setSelectedCityFilter("All")
    setActiveModalTab("photos")
    setShowMemoriesModal(true)
  }

  // Build enriched GeoJSON with Mapbox data-driven styling props
  const enrichGeoJson = (data: any, sel: Country | null) => {
    if (!data || !Array.isArray(data.features)) return data
    const list = countriesRef.current
    return {
      ...data,
      features: data.features.map((f: any) => {
        const country = findCountryMatch(f?.properties?.name || "", list)
        if (country) {
          const isSel = sel?.name === country.name
          const color = CONTINENT_COLORS[country.continent] || "#4F46E5"
          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              __trypoVisited: true,
              __trypoName: country.name,
              __fillColor: color,
              __fillOpacity: isSel ? 0.85 : 0.52,
              __lineColor: isSel ? "#FFFFFF" : color,
              __lineWidth: isSel ? 2.5 : 1.2,
            },
          }
        }
        // Tapped-but-unvisited preview: subtle white highlight so the user
        // sees which country they are about to check as visited.
        const isPreview =
          sel && !sel.visited && normCountryKey(f?.properties?.name || "") === normCountryKey(sel.name)
        if (isPreview) {
          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              __trypoVisited: false,
              __fillColor: "#FFFFFF",
              __fillOpacity: 0.35,
              __lineColor: "#FFFFFF",
              __lineWidth: 2,
            },
          }
        }
        return {
          ...f,
          properties: {
            ...(f.properties || {}),
            __trypoVisited: false,
            __fillColor: "#0f172a",
            __fillOpacity: 0.18,
            __lineColor: "#ffffff",
            __lineWidth: 0.4,
          },
        }
      }),
    }
  }

  const applyCountriesSource = (map: mapboxgl.Map, sel: Country | null) => {
    const raw = geoJsonDataRef.current
    if (!raw) return
    const enriched = enrichGeoJson(raw, sel)
    const source = map.getSource("trypo-countries") as
      | mapboxgl.GeoJSONSource
      | undefined
    if (source) {
      source.setData(enriched as any)
      return
    }
    map.addSource("trypo-countries", { type: "geojson", data: enriched as any })
    map.addLayer({
      id: "trypo-countries-fill",
      type: "fill",
      source: "trypo-countries",
      paint: {
        "fill-color": ["get", "__fillColor"],
        "fill-opacity": ["get", "__fillOpacity"],
      },
    })
    map.addLayer({
      id: "trypo-countries-line",
      type: "line",
      source: "trypo-countries",
      paint: {
        "line-color": ["get", "__lineColor"],
        "line-width": ["get", "__lineWidth"],
        "line-opacity": 0.9,
      },
    })

    map.on("click", "trypo-countries-fill", (e) => {
      const feat = e.features?.[0]
      const name =
        (feat?.properties as any)?.__trypoName ||
        (feat?.properties as any)?.name ||
        ""
      const country = findCountryMatch(String(name || ""), countriesRef.current)
      if (country) {
        setSelected(country)
        map.flyTo({ center: [country.lng, country.lat], zoom: 5, duration: 1200 })
        return
      }
      // Unvisited country tapped: open it as a preview so the user can
      // check it as visited manually.
      const rawName = String((feat?.properties as any)?.name || "").trim()
      if (rawName && e.lngLat) {
        const preview = buildUnvisitedCountry(rawName, e.lngLat.lng, e.lngLat.lat)
        setSelected(preview)
        map.flyTo({ center: [e.lngLat.lng, e.lngLat.lat], zoom: 4, duration: 1200 })
      }
    })
    map.on("mouseenter", "trypo-countries-fill", () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", "trypo-countries-fill", () => {
      map.getCanvas().style.cursor = ""
    })
  }

  // Initialize Mapbox map with GeoJSON country coloring
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return
    if (!configureMapbox()) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLES[layerType],
      center: [15, 28],
      zoom: 1.6,
      minZoom: 1.2,
      maxZoom: 12,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right")

    mapInstanceRef.current = map

    map.on("load", () => {
      mapLoadedRef.current = true
      map.resize()
      try {
        applyMapTheme(map, "trypo")
      } catch {
        // cosmetic only
      }
      renderAvatarsRef.current()
      fetch("/world-countries.json")
        .then((res) => res.json())
        .then((data) => {
          geoJsonDataRef.current = data
          if (!mapInstanceRef.current) return
          applyCountriesSource(map, selectedRef.current)
        })
        .catch((err) => console.warn("Failed to load world geojson:", err))
    })

    // Re-apply country layers after style switches (setStyle drops custom sources)
    map.on("style.load", () => {
      mapLoadedRef.current = true
      try {
        const styleKey = (map as any).__trypoStyleKey as MapboxStyleKey | undefined
        applyMapTheme(map, styleKey || "trypo")
      } catch {
        // ignore
      }
      applyCountriesSource(map, selectedRef.current)
      renderAvatarsRef.current()
    })

    const t1 = setTimeout(() => map.resize(), 100)
    const t2 = setTimeout(() => map.resize(), 400)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      if (mapInstanceRef.current) {
        cityMarkersRef.current.forEach((m) => m.remove())
        cityMarkersRef.current = []
        avatarMarkersRef.current.forEach((m) => m.remove())
        avatarMarkersRef.current = []
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      mapLoadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update Mapbox style
  useEffect(() => {
    if (!mapInstanceRef.current) return
    ;(mapInstanceRef.current as any).__trypoStyleKey = layerType
    mapInstanceRef.current.setStyle(MAPBOX_STYLES[layerType])
  }, [layerType])

  // Update GeoJSON polygon styles when selection changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    try {
      applyCountriesSource(map, selected)
    } catch {
      // style may still be loading — style.load handler will re-apply
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Re-color the globe when the visited list itself changes (trip finished,
  // manual check/uncheck, photo upload) so new countries light up at once.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapLoadedRef.current) return
    try {
      applyCountriesSource(map, selectedRef.current)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCountries])

  // Update city markers on the map when country selection changes
  useEffect(() => {
    cityMarkersRef.current.forEach((m) => m.remove())
    cityMarkersRef.current = []

    const map = mapInstanceRef.current
    if (!map || !selected || !selected.cities || selected.cities.length === 0) return

    const color = CONTINENT_COLORS[selected.continent] || "#4F46E5"

    selected.cities.forEach((city) => {
      const wrapper = document.createElement("div")
      wrapper.className = "trypo-city-pin-wrapper cursor-pointer select-none"
      wrapper.style.display = "flex"
      wrapper.style.alignItems = "center"
      wrapper.style.gap = "6px"

      const inner = document.createElement("div")
      inner.style.display = "flex"
      inner.style.alignItems = "center"
      inner.style.gap = "6px"
      inner.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px;">
          <span style="position: absolute; width: 20px; height: 20px; border-radius: 50%; background: ${color}; opacity: 0.45; animation: ping 2s cubic-bezier(0,0,0.2,1) infinite;"></span>
          <span style="width: 11px; height: 11px; border-radius: 50%; background: #ffffff; border: 2.5px solid ${color}; box-shadow: 0 2px 8px rgba(0,0,0,0.6);"></span>
        </div>
        <div style="background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.25); padding: 3px 8px; border-radius: 9999px; color: #ffffff; font-size: 11px; font-weight: 700; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.5); pointer-events: auto;">
          ${city.name}
        </div>
      `
      wrapper.appendChild(inner)

      wrapper.onclick = (e) => {
        e.stopPropagation()
        handleOpenMemories(selected)
        setSelectedCityFilter(city.name)
      }

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
        .setLngLat([city.lng, city.lat])
        .addTo(map)

      cityMarkersRef.current.push(marker)
    })

    return () => {
      cityMarkersRef.current.forEach((m) => m.remove())
      cityMarkersRef.current = []
    }
  }, [selected])

  // Continent switch handler
  const handleContinentChange = (cont: string) => {
    setActiveContinent(cont)
    const map = mapInstanceRef.current
    if (!map) return

    const center = CONTINENT_CENTERS[cont] || CONTINENT_CENTERS.All
    map.flyTo({ center: [center.lng, center.lat], zoom: center.zoom, duration: 1200 })
  }

  // Filtered photos in modal
  const modalPhotos = (modalCountry?.photos || []).filter(
    (p) => selectedCityFilter === "All" || p.city === selectedCityFilter
  )

  // Story-style slideshow: auto-advance through this place's photos.
  const storyCount = modalPhotos.length
  useEffect(() => {
    if (storyIndex === null) return
    setStoryElapsed(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      setStoryElapsed(elapsed)
      if (elapsed >= STORY_DURATION_MS) {
        setStoryIndex((prev) => {
          if (prev === null) return null
          return prev + 1 < storyCount ? prev + 1 : null
        })
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [storyIndex, storyCount])

  const worldPercentage = Math.min(100, Math.round((visited.length / 195) * 100))

  return (
    <div className="h-full w-full relative bg-[#060d1a] select-none overflow-hidden font-sans md:h-[calc(100dvh-64px)] md:min-h-[600px]">
      {/* 1. Full-Screen Edge-to-Edge Map Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

      {/* 2. Top & Bottom Ambient Vignettes */}
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#060d1a]/95 via-[#060d1a]/60 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#060d1a]/95 via-[#060d1a]/70 to-transparent pointer-events-none z-10" />

      {/* Empty map hint: only the user's own finished trips color the globe */}
      {visited.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-10">
          <div className="rounded-3xl px-6 py-5 text-center backdrop-blur-2xl bg-slate-900/85 border border-white/15 shadow-2xl max-w-[280px]">
            <p className="text-4xl mb-2">🗺️</p>
            <p className="text-white font-black text-[15px] mb-1">Ta carte est vierge</p>
            <p className="text-white/55 text-[12px] leading-relaxed">
              Crée un voyage, termine-le, et chaque pays visité se colorera ici automatiquement 🌍 Ou touche directement un pays pour le cocher ✓
            </p>
          </div>
        </div>
      )}

      {/* 3. Floating Top Controls Layer */}
      <div className="absolute top-0 inset-x-0 pt-10 px-3 z-20 pointer-events-none">
        <div className="flex items-center justify-between gap-2 max-w-md md:max-w-3xl mx-auto pointer-events-auto">
          {/* Back Button */}
          <button
            onClick={() => goBack("profile")}
            aria-label="Retour"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-slate-900/80 hover:bg-slate-800 active:scale-95 backdrop-blur-xl border border-white/15 shadow-xl transition-all cursor-pointer flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M11 14L6 9l5-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Title Pill */}
          <div className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full shadow-xl backdrop-blur-xl bg-slate-900/70 border border-white/10">
            <div className="relative flex-shrink-0">
              <img
                src={myAvatar}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-white font-extrabold text-[13px] tracking-tight">
                My World Map
              </span>
              <span className="text-white/45 font-semibold text-[10px] mt-1">
                {visited.length} pays explorés
              </span>
            </div>
          </div>

          {/* Recenter World View */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleContinentChange("All")}
              aria-label="Vue d'ensemble du monde"
              className="w-10 h-10 rounded-full bg-slate-900/70 hover:bg-slate-800 text-white/80 hover:text-white backdrop-blur-xl border border-white/10 shadow-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Bottom Area: Floating Cards or Horizontal Visited Countries Reel */}
      <div className="absolute bottom-4 inset-x-0 z-20 px-3 md:px-8 pointer-events-none">
        <div className="max-w-md md:max-w-3xl mx-auto pointer-events-auto">
          {selected ? (
            /* Selected Country Glass Card */
            <div className="rounded-[26px] p-4 shadow-2xl backdrop-blur-2xl bg-slate-900/85 border border-white/12 animate-in fade-in slide-in-from-bottom duration-300">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <span className="text-3xl filter drop-shadow-md">{selected.flag}</span>
                    <img
                      src={myAvatar}
                      alt={displayName}
                      title={displayName}
                      className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full object-cover border-2 border-slate-900 shadow-md"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-white font-black text-lg leading-tight tracking-tight">
                        {selected.frenchName}
                      </h2>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ background: `${CONTINENT_COLORS[selected.continent] || "#4F46E5"}bb` }}
                      >
                        {selected.continent}
                      </span>
                    </div>
                    <p className="text-white/50 text-[11px] font-medium mt-0.5">
                      {selected.visited
                        ? `Visité en ${selected.year} • ${selected.cities.length} ${selected.cities.length > 1 ? "villes" : "ville"}`
                        : "Pas encore visité — marque-le d'une touche ✓"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelected(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/70 hover:text-white flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>

              {/* City badges if any */}
              {selected.cities && selected.cities.length > 0 && (
                <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex-shrink-0">
                    Villes:
                  </span>
                  {selected.cities.map((city) => (
                    <button
                      key={city.name}
                      onClick={() => {
                        handleOpenMemories(selected)
                        setSelectedCityFilter(city.name)
                      }}
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/10 hover:bg-white/20 text-white/90 flex-shrink-0 border border-white/10 hover:border-white/25 active:scale-95 transition-all cursor-pointer"
                    >
                      📍 {city.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Photo preview strip if any */}
              {selected.photos && selected.photos.length > 0 && (
                <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar py-0.5">
                  {selected.photos.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        handleOpenMemories(selected)
                        setActiveModalTab("photos")
                      }}
                      className="relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 border border-white/20 shadow-md cursor-pointer hover:scale-105 active:scale-95 transition-transform group"
                    >
                      <img
                        src={p.url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                        <span className="text-[9px] text-white font-bold">Voir</span>
                      </div>
                    </div>
                  ))}
                  {selected.photos.length > 4 && (
                    <button
                      onClick={() => {
                        handleOpenMemories(selected)
                        setActiveModalTab("photos")
                      }}
                      className="w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 flex flex-col items-center justify-center flex-shrink-0 text-white transition-all cursor-pointer"
                    >
                      <span className="text-[12px] font-black">+{selected.photos.length - 4}</span>
                      <span className="text-[9px] text-white/60">photos</span>
                    </button>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {!selected.visited ? (
                <div className="flex items-center gap-2 pt-2.5 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => markCountryVisited(selected)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-black text-sm text-white shadow-lg active:scale-95 transition-all cursor-pointer"
                    style={{
                      background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                      boxShadow: "0 4px 14px rgba(16,185,129,0.4)",
                    }}
                  >
                    <span>✓</span>
                    <span>Marquer comme visité</span>
                  </button>
                </div>
              ) : (
              <div className="flex items-center gap-2 pt-2.5 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => handleOpenMemories(selected)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-2xl font-black text-xs text-white shadow-lg active:scale-95 transition-all cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, #FF6347 0%, #FF4500 100%)",
                    boxShadow: "0 4px 14px rgba(255,99,71,0.4)",
                  }}
                >
                  <span>📸</span>
                  <span>Voir {selected.photos.length + selected.stories.length} souvenirs</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    modalCountryForUpload.current = selected
                    worldFileRef.current?.click()
                  }}
                  disabled={uploadingPhoto}
                  className="px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-bold border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Ajouter une photo depuis l'appareil"
                >
                  <span>📷</span>
                  <span>{uploadingPhoto ? "…" : "Ajouter"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.flyTo({ center: [selected.lng, selected.lat], zoom: 5.5, duration: 1200 })
                    }
                  }}
                  className="w-9 h-9 rounded-2xl bg-cyan-400/15 hover:bg-cyan-400/25 active:scale-95 text-cyan-300 border border-cyan-400/30 flex items-center justify-center transition-all cursor-pointer"
                  title="Centrer la vue"
                >
                  🔍
                </button>
                {selected.manual && selected.cities.length === 0 && (
                  <button
                    type="button"
                    onClick={() => unmarkCountryVisited(selected)}
                    className="px-3 py-2 rounded-2xl bg-red-500/15 hover:bg-red-500/25 active:scale-95 text-red-300 border border-red-400/30 text-xs font-bold transition-all cursor-pointer"
                    title="Retirer des pays visités"
                  >
                    Retirer
                  </button>
                )}
              </div>
              )}
            </div>
          ) : (
            /* Visited Countries Horizontal Carousel */
            <div className="flex flex-col gap-2.5">
              {/* Continents horizontal scroll pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {CONTINENTS.map((cont) => {
                  const isActive = cont === activeContinent
                  const color = CONTINENT_COLORS[cont] || "#4F46E5"
                  return (
                    <button
                      key={cont}
                      type="button"
                      onClick={() => handleContinentChange(cont)}
                      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all backdrop-blur-xl cursor-pointer ${
                        isActive
                          ? "text-white shadow-lg"
                          : "bg-slate-900/60 text-white/55 hover:text-white hover:bg-slate-900/80 border border-white/10"
                      }`}
                      style={{
                        background: isActive ? `linear-gradient(135deg, ${color}, ${color}c4)` : undefined,
                        boxShadow: isActive ? `0 4px 14px ${color}55` : undefined,
                      }}
                    >
                      {cont === "All" ? "🌍 Monde" : cont}
                    </button>
                  )
                })}
              </div>

              {/* Stats & Souvenirs summary row */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-white/80 tracking-[0.14em] uppercase">
                    {activeContinent === "All" ? "Pays explorés" : activeContinent} · {filtered.length}
                  </span>
                  <span className="text-white/25 text-[10px]">•</span>
                  <span className="text-white/45 text-[10px] font-semibold">
                    {worldPercentage}% du globe
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (selected) handleOpenMemories(selected)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[11px] font-bold backdrop-blur-xl active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-coral">📸</span>
                  <span>{totalMemories} Souvenirs</span>
                </button>
              </div>

              <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-4 gap-4 pb-1 pt-0.5" : "flex gap-2.5 overflow-x-auto no-scrollbar pb-1 pt-0.5"}>
                {filtered.length === 0 && (
                  <div className="flex-1 rounded-2xl p-4 backdrop-blur-xl bg-slate-900/80 border border-dashed border-white/20 text-center">
                    <p className="text-white/70 text-[12px] font-semibold">
                      Aucun voyage terminé pour le moment — tes pays visités apparaîtront ici ✈️
                    </p>
                  </div>
                )}
                {filtered.map((c) => {
                  const color = CONTINENT_COLORS[c.continent] || "#4F46E5"
                  const totalMem = c.photos.length + c.stories.length

                  return (
                    <div
                      key={c.name}
                      onClick={() => {
                        setSelected(c)
                        if (mapInstanceRef.current) {
                          mapInstanceRef.current.flyTo({ center: [c.lng, c.lat], zoom: 5, duration: 1200 })
                        }
                      }}
                      className={isDesktop ? "rounded-3xl p-3.5 backdrop-blur-xl bg-slate-900/60 hover:bg-slate-800/75 border border-white/10 hover:border-cyan-400/40 shadow-lg hover:shadow-xl hover:-translate-y-0.5 cursor-pointer group active:scale-[0.97] transition-all flex flex-col justify-between w-full" : "min-w-[150px] max-w-[165px] flex-shrink-0 rounded-3xl p-3.5 backdrop-blur-xl bg-slate-900/60 hover:bg-slate-800/75 border border-white/10 hover:border-cyan-400/40 shadow-lg hover:shadow-xl cursor-pointer group active:scale-[0.97] transition-all flex flex-col justify-between"}
                    >
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <span className="text-2xl filter drop-shadow group-hover:scale-110 transition-transform">
                          {c.flag}
                        </span>
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white"
                          style={{ background: `${color}b8` }}
                        >
                          {c.year}
                        </span>
                      </div>

                      <div className="mb-2.5">
                        <h3 className="text-white font-black text-[13px] truncate leading-tight tracking-tight group-hover:text-cyan-300 transition-colors">
                          {c.frenchName}
                        </h3>
                        <p className="text-white/40 text-[10px] font-medium truncate mt-1">
                          {c.cities.length} {c.cities.length > 1 ? "villes" : "ville"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.08]">
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenMemories(c)
                          }}
                          className="text-[10px] font-bold flex items-center gap-1 bg-white/10 hover:bg-white/15 px-2 py-1 rounded-full transition-colors cursor-pointer text-white/70 hover:text-white"
                        >
                          <span className="text-coral">📸</span>
                          <span>{totalMem}</span>
                        </span>
                        <span className="text-[10px] text-white/35 group-hover:text-cyan-300 transition-colors font-bold tracking-wide">
                          Voir →
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden phone photo picker (camera + gallery on mobile) */}
      <input
        ref={worldFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleWorldPhotoFile}
      />

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* FULL TRAVEL SOUVENIRS & PHOTOS MODAL (CONFINED INSIDE MOBILE SHELL) */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {showMemoriesModal && modalCountry && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{
            background: "rgba(3, 7, 18, 0.75)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Modal Container */}
          <div
            className="w-full max-h-[88%] rounded-t-[32px] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
            style={{
              background: "#0D0F2E",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {/* Modal Header */}
            <div className="p-5 pb-3 border-b border-white/10 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-3xl shadow-lg overflow-hidden"
                      style={{
                        background: CONTINENT_COLORS[modalCountry.continent] || "#4F46E5",
                      }}
                    >
                      {modalCountry.flag}
                    </div>
                    <img
                      src={myAvatar}
                      alt={displayName}
                      title={displayName}
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full object-cover border-2 border-[#0A0C2E] shadow-md"
                    />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-[20px] leading-tight flex items-center gap-2">
                      <span>{modalCountry.frenchName}</span>
                      <span className="text-[11px] font-bold text-indigo-200 bg-white/10 px-2 py-0.5 rounded-md">
                        {modalCountry.year}
                      </span>
                    </h2>
                    <p className="text-white/50 text-[12px] mt-0.5">
                      {modalCountry.cities.length} villes explorées • {modalCountry.photos.length + modalCountry.stories.length} souvenirs
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMemoriesModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center text-sm font-semibold transition-all backdrop-blur-md"
                >
                  ✕
                </button>
              </div>

              {/* Tabs: Photos / Stories / Cities */}
              <div className="flex gap-1.5 mt-4 bg-white/5 p-1 rounded-2xl border border-white/5">
                {[
                  { id: "photos", label: `📸 Photos (${modalCountry.photos?.length || 0})` },
                  { id: "stories", label: `✨ Moments (${modalCountry.stories?.length || 0})` },
                  { id: "cities", label: `📍 Villes (${modalCountry.cities?.length || 0})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveModalTab(tab.id as any)}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
                      activeModalTab === tab.id
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* City filter chips inside modal (for photos) */}
              {activeModalTab === "photos" && modalCountry.cities && modalCountry.cities.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pt-3 pb-0.5 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedCityFilter("All")}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all flex-shrink-0 ${
                      selectedCityFilter === "All"
                        ? "bg-white text-slate-900 shadow-md"
                        : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                  >
                    Toutes ({modalCountry.photos?.length || 0})
                  </button>
                  {modalCountry.cities.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => setSelectedCityFilter(city.name)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all flex-shrink-0 flex items-center gap-1.5 ${
                        selectedCityFilter === city.name
                          ? "bg-white text-slate-900 font-bold shadow-md"
                          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
                      }`}
                    >
                      <span>📍</span>
                      <span>{city.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 pt-3 space-y-4 no-scrollbar">
              {/* TAB 1: PHOTOS GALLERY */}
              {activeModalTab === "photos" && (
                <div>
                  {/* Action Bar: Add photo + Slideshow */}
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        modalCountryForUpload.current = modalCountry
                        worldFileRef.current?.click()
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-[12px] font-semibold border border-dashed border-white/20 hover:border-indigo-400 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <span className="text-indigo-400 font-bold">➕</span>
                      <span>{uploadingPhoto ? "⏳ Envoi…" : "Ajouter une photo"}</span>
                    </button>

                    {modalPhotos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setStoryIndex(0)}
                        className="py-2.5 px-4 rounded-xl text-white text-[12px] font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-500/25 active:scale-[0.98] transition-all cursor-pointer flex-shrink-0"
                        style={{
                          background: "linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)",
                        }}
                      >
                        <span>▶</span>
                        <span>Diaporama</span>
                        <span className="text-white/70 font-semibold text-[11px]">({modalPhotos.length})</span>
                      </button>
                    )}
                  </div>

                  {modalPhotos.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-4xl mb-2.5">📸</p>
                      <p className="text-sm font-bold text-white/80 mb-1">Aucune photo dans cette sélection</p>
                      <p className="text-xs text-white/40">Ajoutez votre premier souvenir pour donner vie à ce voyage.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {modalPhotos.map((photo, idx) => (
                        <div
                          key={photo.id}
                          onClick={() => setStoryIndex(idx)}
                          className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-slate-900 shadow-lg cursor-pointer border border-white/10 hover:border-white/30 transition-all hover:scale-[1.02]"
                        >
                          <img
                            src={photo.url}
                            alt={photo.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div
                            className="absolute inset-0 flex flex-col justify-end p-2.5"
                            style={{
                              background:
                                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)",
                            }}
                          >
                            {/* Top badge tags */}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-[10px] font-semibold text-white/90 border border-white/10 flex items-center gap-1">
                              <span className="text-rose-400">📍</span>
                              <span className="truncate max-w-[80px]">{photo.city}</span>
                            </div>

                            {photo.likes > 0 && (
                              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-[10px] font-semibold text-rose-300 border border-white/10 flex items-center gap-1">
                                <span>❤️</span>
                                <span>{photo.likes}</span>
                              </div>
                            )}

                            <p className="text-white font-bold text-[11px] line-clamp-1 leading-tight mb-0.5">
                              {photo.title}
                            </p>
                            <span className="text-[10px] text-white/50">{photo.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: STORIES / KEY MOMENTS */}
              {activeModalTab === "stories" && (
                <div className="space-y-3">
                  {(modalCountry.stories || []).length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-4xl mb-2.5">✨</p>
                      <p className="text-sm font-bold text-white/80 mb-1">Aucun moment marquant</p>
                      <p className="text-xs text-white/40">Vos anecdotes et temps forts s'afficheront ici.</p>
                    </div>
                  ) : (
                    (modalCountry.stories || []).map((st) => (
                      <div
                        key={st.id}
                        className="p-3.5 rounded-2xl border border-white/10 flex items-start gap-3 bg-white/[0.04] hover:bg-white/[0.07] transition-all"
                      >
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl flex-shrink-0">
                          {st.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-white font-bold text-[13px]">{st.title}</h4>
                            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-md border border-indigo-500/20">
                              {st.category}
                            </span>
                          </div>
                          <p className="text-white/70 text-[11px] leading-relaxed mb-1.5">
                            {st.notes}
                          </p>
                          <p className="text-white/40 text-[10px] flex items-center gap-1">
                            <span>📍 {st.city}</span>
                            <span>•</span>
                            <span>{st.date}</span>
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: EXPLORED CITIES */}
              {activeModalTab === "cities" && (
                <div className="space-y-2">
                  {(modalCountry.cities || []).map((city) => (
                    <div
                      key={city.name}
                      onClick={() => {
                        setSelectedCityFilter(city.name)
                        setActiveModalTab("photos")
                      }}
                      className="p-3 rounded-2xl border border-white/10 flex items-center justify-between cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-lg">
                          🏙️
                        </div>
                        <div>
                          <p className="text-white font-bold text-[13px] group-hover:text-indigo-300 transition-colors">{city.name}</p>
                          <p className="text-white/40 text-[10px]">Visité en {city.visitedYear}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 group-hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/20 transition-all flex items-center gap-1">
                        <span>Voir</span>
                        <span>→</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer Action */}
            <div className="p-4 border-t border-white/10 flex-shrink-0 bg-[#0A0C2E]/90 backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  setShowMemoriesModal(false)
                  navigate("trip-memories")
                }}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[13px] shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <span>🎬</span>
                <span>Ouvrir l'album complet du voyage</span>
                <span className="text-white/60">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* STORY VIEWER (FULLSCREEN SLIDESHOW OF THIS PLACE'S PHOTOS) */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {storyIndex !== null && modalPhotos[storyIndex] && (
        <div className="fixed inset-0 z-[70] bg-black overflow-hidden animate-in fade-in duration-200">
          {/* Photo */}
          <img
            key={modalPhotos[storyIndex].id}
            src={modalPhotos[storyIndex].url}
            alt={modalPhotos[storyIndex].title}
            className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/85 pointer-events-none" />

          {/* Top chrome: progress + place info, kept tight and safe-area aware */}
          <div className="absolute top-0 inset-x-0 z-20 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
            {/* Progress bars */}
            <div className="flex items-center gap-[3px]">
              {modalPhotos.map((p, i) => (
                <div key={p.id} className="flex-1 h-[2px] rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{
                      width:
                        i < storyIndex
                          ? "100%"
                          : i === storyIndex
                            ? `${Math.min(100, (storyElapsed / STORY_DURATION_MS) * 100)}%`
                            : "0%",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Place row: flag + city + counter, then close */}
            <div className="mt-3 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0 rounded-full pl-1 pr-2.5 py-1 bg-black/25 backdrop-blur-md border border-white/10">
                <span className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[13px] leading-none flex-shrink-0">
                  {modalCountry?.flag}
                </span>
                <span className="text-white text-[12.5px] font-extrabold tracking-tight truncate drop-shadow">
                  {modalPhotos[storyIndex].city}
                </span>
                <span className="text-white/50 text-[10px] font-bold tabular-nums flex-shrink-0">
                  {storyIndex + 1}/{modalPhotos.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStoryIndex(null)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center font-bold text-sm active:scale-95 transition-all cursor-pointer flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tap zones: left third = previous, right two-thirds = next */}
          <button
            type="button"
            aria-label="Photo précédente"
            onClick={() =>
              setStoryIndex((prev) => (prev === null ? prev : Math.max(0, prev - 1)))
            }
            className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer"
          />
          <button
            type="button"
            aria-label="Photo suivante"
            onClick={() =>
              setStoryIndex((prev) =>
                prev === null ? prev : prev + 1 < modalPhotos.length ? prev + 1 : null
              )
            }
            className="absolute inset-y-0 right-0 w-2/3 z-10 cursor-pointer"
          />

          {/* Bottom caption */}
          <div className="absolute bottom-0 inset-x-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none">
            <p className="text-white font-extrabold text-[15px] leading-snug tracking-tight mb-1">
              {modalPhotos[storyIndex].title}
            </p>
            {modalPhotos[storyIndex].caption && (
              <p className="text-white/75 text-[12px] leading-relaxed mb-2.5">
                {modalPhotos[storyIndex].caption}
              </p>
            )}
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <span className="text-white/55">📅 {modalPhotos[storyIndex].date}</span>
              <span className="w-1 h-1 rounded-full bg-white/25" />
              <span className="text-coral">❤️ {modalPhotos[storyIndex].likes}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


