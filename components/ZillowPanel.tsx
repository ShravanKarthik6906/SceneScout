"use client";

import { useEffect, useState } from "react";
import { LocationResult } from "@/store/scoutStore";

interface ZillowListing {
  zpid: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  imgSrc: string;
  detailUrl: string;
  has3DTour: boolean;
  tourUrl: string | null;
}

interface ZillowPanelProps {
  location: LocationResult;
  onClose: () => void;
}

export default function ZillowPanel({ location, onClose }: ZillowPanelProps) {
  const [listings, setListings] = useState<ZillowListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tourUrl, setTourUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setListings([]);
    fetch(`/api/zillow?lat=${location.lat}&lng=${location.lng}`)
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [location.lat, location.lng]);

  return (
    <>
      {/* Mobile bottom sheet / desktop right drawer */}
      <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[400px] bg-white shadow-2xl flex flex-col border-l border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div>
            <h3 className="font-semibold text-gray-900">Nearby Properties</h3>
            <p className="text-xs text-gray-500">{location.name} · 0.5 mi radius</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-100 rounded-xl h-32 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && listings.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <span className="text-4xl mb-2">🏠</span>
              <p className="text-sm">No nearby properties found</p>
            </div>
          )}

          {listings.map((listing) => (
            <div
              key={listing.zpid}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow"
            >
              {listing.imgSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={listing.imgSrc}
                  alt={listing.address}
                  className="w-full h-36 object-cover"
                />
              )}
              <div className="p-3">
                <p className="text-sm font-medium text-gray-900 truncate">{listing.address}</p>
                <p className="text-sm font-bold text-indigo-600 mt-0.5">
                  {listing.price
                    ? `$${listing.price.toLocaleString()}`
                    : "Price not listed"}
                </p>
                <div className="flex gap-3 text-xs text-gray-500 mt-1">
                  {listing.bedrooms && <span>{listing.bedrooms} bd</span>}
                  {listing.bathrooms && <span>{listing.bathrooms} ba</span>}
                </div>
                <div className="flex gap-2 mt-2">
                  {listing.detailUrl && (
                    <a
                      href={listing.detailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg transition-colors"
                    >
                      View on Zillow
                    </a>
                  )}
                  {listing.has3DTour && listing.tourUrl && (
                    <button
                      onClick={() => setTourUrl(listing.tourUrl)}
                      className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-lg transition-colors"
                    >
                      View 3D Tour
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Powered by Zillow
        </div>
      </div>

      {/* 3D Tour Modal */}
      {tourUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h4 className="font-semibold">Zillow 3D Home Tour</h4>
              <button
                onClick={() => setTourUrl(null)}
                className="text-gray-400 hover:text-gray-700 text-sm bg-gray-100 px-3 py-1.5 rounded-lg"
              >
                ✕ Close
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                src={tourUrl}
                className="w-full h-full"
                allowFullScreen
                title="Zillow 3D Tour"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
