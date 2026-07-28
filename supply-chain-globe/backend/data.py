"""Static demo supply-chain network: nodes (facilities) and routes (lanes
connecting them). Standing in for a real data source until one exists —
see the MVP scope note in README.md.
"""

NODES = [
    {"id": "shenzhen", "name": "Shenzhen Electronics Cluster", "type": "factory",
     "country": "China", "lat": 22.5431, "lng": 114.0579},
    {"id": "shanghai", "name": "Port of Shanghai", "type": "port",
     "country": "China", "lat": 31.2304, "lng": 121.4737},
    {"id": "ningbo", "name": "Port of Ningbo-Zhoushan", "type": "port",
     "country": "China", "lat": 29.8683, "lng": 121.5440},
    {"id": "ho_chi_minh", "name": "Ho Chi Minh City Manufacturing", "type": "factory",
     "country": "Vietnam", "lat": 10.8231, "lng": 106.6297},
    {"id": "mumbai", "name": "Port of Mumbai", "type": "port",
     "country": "India", "lat": 18.9647, "lng": 72.8258},
    {"id": "los_angeles", "name": "Port of Los Angeles", "type": "port",
     "country": "USA", "lat": 33.7395, "lng": -118.2610},
    {"id": "chicago", "name": "Chicago Distribution Center", "type": "distribution_center",
     "country": "USA", "lat": 41.8781, "lng": -87.6298},
    {"id": "rotterdam", "name": "Port of Rotterdam", "type": "port",
     "country": "Netherlands", "lat": 51.9496, "lng": 4.1453},
    {"id": "hamburg", "name": "Hamburg Regional Warehouse", "type": "warehouse",
     "country": "Germany", "lat": 53.5511, "lng": 9.9937},
    {"id": "sao_paulo", "name": "São Paulo Distribution Center", "type": "distribution_center",
     "country": "Brazil", "lat": -23.5558, "lng": -46.6396},
]

ROUTES = [
    {"id": "shenzhen-shanghai", "source": "shenzhen", "target": "shanghai",
     "mode": "rail", "lead_time_days": 2, "volume_teu": 4200},
    {"id": "shanghai-la", "source": "shanghai", "target": "los_angeles",
     "mode": "sea", "lead_time_days": 16, "volume_teu": 18500},
    {"id": "shanghai-rotterdam", "source": "shanghai", "target": "rotterdam",
     "mode": "sea", "lead_time_days": 32, "volume_teu": 15200},
    {"id": "ningbo-rotterdam", "source": "ningbo", "target": "rotterdam",
     "mode": "sea", "lead_time_days": 31, "volume_teu": 9800},
    {"id": "hcm-la", "source": "ho_chi_minh", "target": "los_angeles",
     "mode": "sea", "lead_time_days": 19, "volume_teu": 7600},
    {"id": "shenzhen-hcm", "source": "shenzhen", "target": "ho_chi_minh",
     "mode": "land", "lead_time_days": 3, "volume_teu": 1400},
    {"id": "mumbai-rotterdam", "source": "mumbai", "target": "rotterdam",
     "mode": "sea", "lead_time_days": 22, "volume_teu": 6300},
    {"id": "la-chicago", "source": "los_angeles", "target": "chicago",
     "mode": "rail", "lead_time_days": 4, "volume_teu": 12100},
    {"id": "rotterdam-hamburg", "source": "rotterdam", "target": "hamburg",
     "mode": "land", "lead_time_days": 1, "volume_teu": 5400},
    {"id": "rotterdam-sao-paulo", "source": "rotterdam", "target": "sao_paulo",
     "mode": "sea", "lead_time_days": 18, "volume_teu": 3200},
]
