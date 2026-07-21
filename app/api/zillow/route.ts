import { NextResponse } from "next/server";

const MOCK_LISTINGS = [
  {
    zpid: "z001",
    address: "142 Mill St, Bethlehem, PA 18015",
    price: 285000,
    bedrooms: 3,
    bathrooms: 2,
    imgSrc: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=600&q=80",
    detailUrl: "https://www.zillow.com",
    has3DTour: true,
    tourUrl: "https://www.zillow.com",
  },
  {
    zpid: "z002",
    address: "87 Industrial Ave, Bethlehem, PA 18015",
    price: 199000,
    bedrooms: 2,
    bathrooms: 1,
    imgSrc: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&q=80",
    detailUrl: "https://www.zillow.com",
    has3DTour: false,
    tourUrl: null,
  },
  {
    zpid: "z003",
    address: "310 Furnace Rd, Bethlehem, PA 18016",
    price: 425000,
    bedrooms: 4,
    bathrooms: 3,
    imgSrc: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80",
    detailUrl: "https://www.zillow.com",
    has3DTour: true,
    tourUrl: "https://www.zillow.com",
  },
  {
    zpid: "z004",
    address: "55 Riverside Dr, Bethlehem, PA 18015",
    price: 159000,
    bedrooms: 2,
    bathrooms: 1,
    imgSrc: "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=600&q=80",
    detailUrl: "https://www.zillow.com",
    has3DTour: false,
    tourUrl: null,
  },
];

export async function GET() {
  await new Promise((r) => setTimeout(r, 500));
  return NextResponse.json({ listings: MOCK_LISTINGS });
}
