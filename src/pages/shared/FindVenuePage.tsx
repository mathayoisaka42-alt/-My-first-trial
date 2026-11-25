import React, { useEffect, useState, useCallback } from 'react';
import { MapPin, Search, Calendar, Users, CheckCircle2, XCircle, Building2, Plus, Upload, X } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface VenueBookingItem {
  id: string;
  title: string;
  booking_type: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  module_code: string | null;
  booked_by_name: string | null;
}

interface VenueItem {
  id: string;
  code: string;
  name: string;
  description: string;
  building_name: string;
  campus_location: string;
  capacity: number;
  venue_type: string;
  facilities: string[];
  accessibility_info: string | null;
  photo_url: string | null;
  is_official_photo: number;
  is_sample_data: number;
  availabilityStatus: 'FREE' | 'OCCUPIED';
  activeConflict: VenueBookingItem | null;
  daySchedule: VenueBookingItem[];
}

const VENUE_TYPES = [
  { value: '', label: 'All Venue Types' },
  { value: 'LECTURE_HALL', label: 'Lecture Halls' },
  { value: 'CLASSROOM', label: 'Classrooms' },
  { value: 'COMPUTER_LAB', label: 'Computer Laboratories' },
  { value: 'SCIENCE_LAB', label: 'Science Laboratories' },
  { value: 'SEMINAR_ROOM', label: 'Seminar Rooms' },
  { value: 'CONFERENCE_ROOM', label: 'Conference Rooms' },
  { value: 'LIBRARY', label: 'Libraries' },
  { value: 'SPORTS_FACILITY', label: 'Sports Facilities' },
  { value: 'OTHER', label: 'Other University Facilities' },
];

export const FindVenuePage: React.FC = () => {
  const { apiFetch, hasAnyRole, notify } = useAuth();
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const todayDar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam' }).format(new Date());

  // FIND FREE VENUE Filters
  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('');
  const [venueType, setVenueType] = useState('');
  const [minCapacity, setMinCapacity] = useState('');
  const [date, setDate] = useState(todayDar);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FREE' | 'OCCUPIED'>('ALL');

  // Detail & Booking modal
  const [selectedVenue, setSelectedVenue] = useState<VenueItem | null>(null);
  const [bookTitle, setBookTitle] = useState('');
  const [bookDate, setBookDate] = useState(todayDar);
  const [bookStart, setBookStart] = useState('10:00');
  const [bookEnd, setBookEnd] = useState('12:00');
  const [bookingLoading, setBookingLoading] = useState(false);

  // Admin Create Venue / Upload Photo
  const [showCreateVenue, setShowCreateVenue] = useState(false);
  const [vCode, setVCode] = useState('');
  const [vName, setVName] = useState('');
  const [vDesc, setVDesc] = useState('');
  const [vBldg, setVBldg] = useState('');
  const [vLoc, setVLoc] = useState('');
  const [vCap, setVCap] = useState('60');
  const [vType, setVType] = useState('LECTURE_HALL');
  const [vFac, setVFac] = useState('Projector, Whiteboard');
  const [vPhoto, setVPhoto] = useState<File | null>(null);

  const canBook = hasAnyRole(['LECTURER', 'PRINCIPAL', 'BOARD', 'ADMIN']);
  const canManageVenues = hasAnyRole(['PRINCIPAL', 'ADMIN']);

  const loadVenues = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (startTime && endTime) {
        params.set('startTime', startTime);
        params.set('endTime', endTime);
      }
      if (search.trim()) params.set('search', search.trim());
      if (building.trim()) params.set('building', building.trim());
      if (venueType) params.set('venueType', venueType);
      if (minCapacity) params.set('minCapacity', minCapacity);

      const data = await apiFetch<{ venues: VenueItem[] }>(`/api/venues?${params.toString()}`);
      setVenues(data.venues);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to query campus venues.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, date, startTime, endTime, search, building, venueType, minCapacity, notify]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  const handleBookVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVenue) return;
    setBookingLoading(true);
    try {
      await apiFetch('/api/venues/book', {
        method: 'POST',
        body: JSON.stringify({
          venueId: selectedVenue.id,
          title: bookTitle,
          bookingType: 'LECTURER_BOOKING',
          bookingDate: bookDate,
          startTime: bookStart,
          endTime: bookEnd,
        }),
      });
      notify('success', `Confirmed booking for ${selectedVenue.name}.`);
      setBookTitle('');
      setSelectedVenue(null);
      await loadVenues();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Booking conflict or error.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('code', vCode);
      fd.append('name', vName);
      fd.append('description', vDesc);
      fd.append('buildingName', vBldg);
      fd.append('campusLocation', vLoc);
      fd.append('capacity', vCap);
      fd.append('venueType', vType);
      fd.append('facilities', vFac);
      if (vPhoto) fd.append('photo', vPhoto);
      await apiFetch('/api/venues', { method: 'POST', body: fd });
      notify('success', 'Official venue added to directory.');
      setShowCreateVenue(false);
      setVCode('');
      setVName('');
      setVDesc('');
      await loadVenues();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create venue.');
    }
  };

  const handleUploadOfficialPhoto = async (venueId: string, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await apiFetch(`/api/venues/${venueId}/photo`, { method: 'POST', body: fd });
      notify('success', 'Official MUST venue photograph uploaded.');
      await loadVenues();
      setSelectedVenue(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Photo upload failed.');
    }
  };

  const visibleVenues = venues.filter((v) => statusFilter === 'ALL' || v.availabilityStatus === statusFilter);

  return (
    <PortalLayout
      title="FIND VENUE — Campus Discovery &amp; Availability"
      subtitle="Live availability computed from scheduled timetable and approved lecturer bookings"
    >
      <div className="space-y-6">
        {/* Search & FIND FREE VENUE Engine Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#12304A]">FIND FREE VENUE — Availability Search</h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {(['ALL', 'FREE', 'OCCUPIED'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      statusFilter === s ? 'bg-white text-[#12304A] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {s === 'ALL' ? 'All Venues' : s === 'FREE' ? 'Free Only' : 'Occupied'}
                  </button>
                ))}
              </div>
              {canManageVenues && (
                <button
                  type="button"
                  onClick={() => setShowCreateVenue((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#12304A] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1C638A]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Venue
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search venue name or code..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[#1C638A] focus:outline-none"
              />
            </div>
            <input
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="Building name..."
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select value={venueType} onChange={(e) => setVenueType(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {VENUE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="number"
              value={minCapacity}
              onChange={(e) => setMinCapacity(e.target.value)}
              placeholder="Min capacity"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-slate-600">Check specific time window:</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono" />
            <span className="text-slate-400">to</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono" />
            {(startTime || endTime) && (
              <button type="button" onClick={() => { setStartTime(''); setEndTime(''); }} className="text-[#1C638A] hover:underline">
                Reset to Current Time
              </button>
            )}
          </div>
        </div>

        {/* Admin Create Venue Form */}
        {canManageVenues && showCreateVenue && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-semibold text-[#12304A]">Register Official Campus Venue</h3>
            <form onSubmit={handleCreateVenue} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <input required value={vCode} onChange={(e) => setVCode(e.target.value)} placeholder="Venue Code (e.g. LH-02)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Venue Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select value={vType} onChange={(e) => setVType(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {VENUE_TYPES.filter((t) => t.value).map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <input required value={vBldg} onChange={(e) => setVBldg(e.target.value)} placeholder="Building Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required value={vLoc} onChange={(e) => setVLoc(e.target.value)} placeholder="Campus Location" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required type="number" value={vCap} onChange={(e) => setVCap(e.target.value)} placeholder="Capacity" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={vFac} onChange={(e) => setVFac(e.target.value)} placeholder="Facilities (comma-separated)" className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="file" accept="image/*" onChange={(e) => setVPhoto(e.target.files?.[0] ?? null)} className="text-xs" />
              <textarea required value={vDesc} onChange={(e) => setVDesc(e.target.value)} placeholder="Venue description and directions..." className="sm:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-[#12304A] py-2 text-sm font-medium text-white hover:bg-[#1C638A]">Save Official Venue</button>
            </form>
          </div>
        )}

        {/* Venue Cards Grid */}
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Checking live venue timetable...</p>
        ) : visibleVenues.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No venues match the selected availability filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleVenues.map((v) => (
              <div
                key={v.id}
                onClick={() => setSelectedVenue(v)}
                className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-[#1C638A] transition flex flex-col"
              >
                <div className="relative aspect-[4/3] bg-[#12304A]/5 overflow-hidden">
                  {v.photo_url ? (
                    <img
                      src={v.photo_url}
                      alt={v.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#12304A]/10 to-[#1C638A]/10 text-[#12304A]">
                      <Building2 className="h-8 w-8 opacity-60" />
                      <span className="mt-2 font-mono text-xs">{v.code}</span>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] text-white">
                    {v.is_official_photo ? 'Official Campus Photo' : 'Illustrative Preview'}
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#1C638A]">{v.code}</span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          v.availabilityStatus === 'FREE' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {v.availabilityStatus === 'FREE' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {v.availabilityStatus}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-[#12304A]">{v.name}</h3>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">{v.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {v.building_name}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums shrink-0">
                      <Users className="h-3.5 w-3.5" /> {v.capacity}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Venue Detail, Timetable & Lecturer Booking Modal */}
      {selectedVenue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <p className="font-mono text-xs font-semibold text-[#1C638A]">
                  {selectedVenue.code} · {selectedVenue.venue_type.replace(/_/g, ' ')}
                </p>
                <h3 className="text-lg font-bold text-[#12304A]">{selectedVenue.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedVenue(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <p><span className="text-slate-500">Building:</span> <strong className="text-[#12304A]">{selectedVenue.building_name}</strong></p>
                  <p><span className="text-slate-500">Campus Location:</span> <strong className="text-[#12304A]">{selectedVenue.campus_location}</strong></p>
                  <p><span className="text-slate-500">Seating Capacity:</span> <strong className="font-mono text-[#12304A]">{selectedVenue.capacity}</strong></p>
                  <p><span className="text-slate-500">Accessibility:</span> <span className="text-slate-700">{selectedVenue.accessibility_info || 'Standard ground access'}</span></p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Facilities</p>
                  <p className="mt-1 text-slate-700">{selectedVenue.facilities.join(' · ') || 'Standard teaching room'}</p>
                  {canManageVenues && (
                    <label className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#1C638A] cursor-pointer hover:underline">
                      <Upload className="h-3.5 w-3.5" />
                      Upload Official MUST Photograph
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadOfficialPhoto(selectedVenue.id, f);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Day Schedule */}
              <div>
                <h4 className="text-sm font-semibold text-[#12304A] flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-[#1C638A]" />
                  Scheduled Classes &amp; Bookings ({date})
                </h4>
                {selectedVenue.daySchedule.length === 0 ? (
                  <p className="mt-2 text-xs text-emerald-700">No classes or reservations booked on {date}. Venue is free all day.</p>
                ) : (
                  <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {selectedVenue.daySchedule.map((b) => (
                      <div key={b.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-[#12304A]">{b.title}</p>
                          <p className="text-slate-500">{b.booking_type} · {b.booked_by_name}</p>
                        </div>
                        <span className="font-mono font-medium text-[#1C638A] tabular-nums">
                          {b.start_time} – {b.end_time}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lecturer / Admin Booking Form */}
              {canBook && (
                <form onSubmit={handleBookVenue} className="rounded-lg border border-slate-200 bg-[#F3F6F9] p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-[#12304A]">Reserve This Venue</h4>
                  <input
                    required
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="Session title (e.g. CS 201 Extra Tutorial)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="date" required value={bookDate} onChange={(e) => setBookDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono" />
                    <input type="time" required value={bookStart} onChange={(e) => setBookStart(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono" />
                    <input type="time" required value={bookEnd} onChange={(e) => setBookEnd(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono" />
                  </div>
                  <button
                    type="submit"
                    disabled={bookingLoading}
                    className="w-full rounded-lg bg-[#12304A] py-2 text-xs font-medium text-white hover:bg-[#1C638A] disabled:opacity-60"
                  >
                    {bookingLoading ? 'Checking Conflicts...' : 'Confirm Venue Booking'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};
