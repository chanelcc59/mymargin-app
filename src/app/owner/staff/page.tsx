'use client';

import { useEffect, useMemo, useState } from 'react';
import { storeStore, employeeStore, attendanceStore } from '@/lib/store';
import type {
  Store, Employee, AttendanceRecord, AttendanceType, EmployeeRole,
} from '@/types/domain';
import { distanceMeters, formatDistance, formatKRW } from '@/lib/cost-engine';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })} ${formatTime(ms)}`;
}

function durationText(fromMs: number, toMs: number): string {
  const min = Math.max(0, Math.round((toMs - fromMs) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

export default function StaffPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState<{ initial: Employee | null } | null>(null);
  const [logDate, setLogDate] = useState<string>(todayLocal());

  // 출퇴근 처리 상태
  const [pending, setPending] = useState<AttendanceType | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string>('');
  const [pendingError, setPendingError] = useState<string>('');

  const reload = () => {
    const s = storeStore.get();
    setStore(s);
    setEmployees(employeeStore.list());
    setRecords(attendanceStore.list());
  };

  useEffect(() => {
    reload();
    setLoaded(true);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // 첫 활성 직원 자동 선택
  useEffect(() => {
    if (!selectedEmployeeId && employees.length > 0) {
      const first = employees.find((e) => e.active) ?? employees[0];
      setSelectedEmployeeId(first.id);
    }
  }, [employees, selectedEmployeeId]);

  const todayRecords = useMemo(
    () => attendanceStore_listByDateLocal(records, todayLocal()).sort((a, b) => a.occurredAt - b.occurredAt),
    [records]
  );

  // 직원별 오늘 마지막 상태(check_in 후 check_out 없음 → 근무 중)
  const todayByEmployee = useMemo(() => {
    const map = new Map<string, { in?: AttendanceRecord; out?: AttendanceRecord }>();
    todayRecords.forEach((r) => {
      const cur = map.get(r.employeeId) ?? {};
      if (r.type === 'check_in') {
        if (!cur.in || r.occurredAt > cur.in.occurredAt) cur.in = r;
      } else {
        if (!cur.out || r.occurredAt > cur.out.occurredAt) cur.out = r;
      }
      map.set(r.employeeId, cur);
    });
    return map;
  }, [todayRecords]);

  const dateRecords = useMemo(
    () => attendanceStore_listByDateLocal(records, logDate).sort((a, b) => b.occurredAt - a.occurredAt),
    [records, logDate]
  );

  // 위치 기반 출퇴근 처리
  const handleClock = (type: AttendanceType) => {
    setPendingMsg('');
    setPendingError('');

    if (!store || store.lat == null || store.lng == null) {
      setPendingError('먼저 매장 좌표를 설정하세요. 아래 "매장 정보 수정"을 누르세요.');
      return;
    }
    if (!selectedEmployeeId) {
      setPendingError('직원을 먼저 선택하세요.');
      return;
    }
    if (!('geolocation' in navigator)) {
      setPendingError('이 브라우저는 위치 정보를 지원하지 않아요.');
      return;
    }

    setPending(type);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const dist = distanceMeters(lat, lng, store.lat!, store.lng!);
        const accepted = dist <= store.attendanceRadiusM;

        if (!accepted) {
          setPending(null);
          setPendingError(`현재 위치가 허용 반경 밖입니다 (${formatDistance(dist)} 떨어져 있음).`);
          return;
        }

        attendanceStore.create({
          employeeId: selectedEmployeeId,
          type,
          occurredAt: Date.now(),
          lat, lng,
          distanceM: dist,
          accepted: true,
        });
        const emp = employees.find((e) => e.id === selectedEmployeeId);
        setPendingMsg(`✓ ${emp?.name ?? ''} ${type === 'check_in' ? '출근' : '퇴근'} 기록됨 (${formatDistance(dist)})`);
        setPending(null);
        reload();
      },
      (err) => {
        setPending(null);
        if (err.code === err.PERMISSION_DENIED) {
          setPendingError('위치 권한이 거부되었어요. 브라우저 설정에서 이 사이트의 위치 권한을 허용해주세요.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setPendingError('현재 위치를 확인할 수 없어요. 잠시 후 다시 시도해보세요.');
        } else if (err.code === err.TIMEOUT) {
          setPendingError('위치 확인 시간이 초과됐어요. 다시 시도해보세요.');
        } else {
          setPendingError('위치 확인 중 오류가 발생했어요.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  const storeReady = !!(store && store.lat != null && store.lng != null);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">직원 · 근태</h1>
        <p className="text-ink-3 text-[13px] mt-1">매장 좌표를 기준으로 반경 안에서만 출퇴근이 기록됩니다.</p>
      </div>

      {/* 매장 정보 카드 */}
      <div className={[
        'rounded-2xl border p-4 flex items-start justify-between gap-3 flex-wrap',
        storeReady ? 'bg-surface border-border' : 'bg-warning-bg border-warning/40',
      ].join(' ')}>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-ink-3 tracking-[0.04em] uppercase mb-0.5">매장 정보</div>
          {store ? (
            <>
              <div className="text-[16px] font-bold tracking-tighter text-ink">{store.name}</div>
              {store.address && <div className="text-[12px] text-ink-3 mt-0.5">{store.address}</div>}
              {storeReady ? (
                <div className="text-[11px] text-ink-3 font-serif-num mt-1">
                  좌표 {store.lat!.toFixed(6)}, {store.lng!.toFixed(6)} · 반경 {store.attendanceRadiusM}m
                </div>
              ) : (
                <div className="text-[12px] text-warning font-bold mt-1">⚠ 좌표 미설정 — 출퇴근 기록을 시작하려면 좌표를 먼저 설정하세요</div>
              )}
            </>
          ) : (
            <div className="text-[12px] text-warning font-bold">⚠ 매장 정보를 먼저 등록해주세요</div>
          )}
        </div>
        <button
          onClick={() => setShowStoreModal(true)}
          className="px-3 py-1.5 border border-border-strong text-[12px] font-bold text-ink-2 rounded-lg hover:border-navy hover:text-navy"
        >
          {store ? '매장 정보 수정' : '매장 등록'}
        </button>
      </div>

      {/* 빠른 출퇴근 */}
      {employees.length > 0 && (
        <div className="bg-navy text-white rounded-2xl p-5">
          <div className="text-[11px] font-bold tracking-[0.04em] uppercase text-white/70 mb-2">빠른 출퇴근</div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-[14px] text-white outline-none focus:border-white flex-1 min-w-0"
            >
              {employees.filter((e) => e.active).map((e) => (
                <option key={e.id} value={e.id} className="text-ink">{e.name} ({e.role === 'owner' ? '점주' : '직원'})</option>
              ))}
            </select>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => handleClock('check_in')}
                disabled={pending !== null || !storeReady}
                className="px-5 py-2.5 bg-accent text-white text-[14px] font-bold rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed flex-1 md:flex-initial min-w-[80px]"
              >{pending === 'check_in' ? '확인 중...' : '출근'}</button>
              <button
                onClick={() => handleClock('check_out')}
                disabled={pending !== null || !storeReady}
                className="px-5 py-2.5 bg-white/15 text-white text-[14px] font-bold rounded-lg hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed flex-1 md:flex-initial min-w-[80px]"
              >{pending === 'check_out' ? '확인 중...' : '퇴근'}</button>
            </div>
          </div>
          {pendingMsg && (
            <div className="mt-3 text-[12px] font-bold text-accent-bg bg-accent/30 px-3 py-2 rounded-lg">{pendingMsg}</div>
          )}
          {pendingError && (
            <div className="mt-3 text-[12px] font-bold text-white bg-alert/40 px-3 py-2 rounded-lg">{pendingError}</div>
          )}
          {!storeReady && (
            <div className="mt-3 text-[11px] text-white/70">매장 좌표를 먼저 설정해야 출퇴근이 가능해요.</div>
          )}
        </div>
      )}

      {/* 오늘 근태 (직원별) */}
      {employees.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[15px] font-bold tracking-tighter text-ink">오늘 근태</div>
            <div className="text-[11px] text-ink-3 font-serif-num">{todayLocal()}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {employees.filter((e) => e.active).map((e) => {
              const t = todayByEmployee.get(e.id);
              const working = !!(t?.in && (!t.out || t.in.occurredAt > t.out.occurredAt));
              return (
                <div key={e.id} className="bg-surface-alt/50 rounded-xl p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-bold tracking-tighter text-ink">{e.name}</div>
                      <div className="text-[10px] text-ink-3">{e.role === 'owner' ? '점주' : '직원'}</div>
                    </div>
                    {working ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-bg text-accent">근무 중</span>
                    ) : t?.in ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-alt text-ink-3">퇴근</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-alt text-ink-4">미출근</span>
                    )}
                  </div>
                  {t?.in && (
                    <div className="text-[11px] text-ink-3 mt-1.5 font-serif-num">
                      출근 {formatTime(t.in.occurredAt)}
                      {t.out && t.out.occurredAt > t.in.occurredAt && (
                        <> · 퇴근 {formatTime(t.out.occurredAt)} <span className="text-ink-2 font-bold">({durationText(t.in.occurredAt, t.out.occurredAt)})</span></>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 직원 목록 */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-[15px] font-bold tracking-tighter text-ink">직원 목록</div>
          <button
            onClick={() => setShowEmployeeModal({ initial: null })}
            className="text-[12px] text-accent font-bold hover:underline"
          >＋ 직원 추가</button>
        </div>
        {employees.length === 0 ? (
          <div className="border-2 border-dashed border-warning/40 bg-warning-bg/30 rounded-xl p-6 text-center">
            <div className="font-serif text-[16px] italic tracking-tighter text-warning mb-1">직원이 없어요</div>
            <div className="text-[12px] text-ink-3">먼저 <strong>＋ 직원 추가</strong> 로 본인이라도 등록하세요</div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {employees.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 bg-navy-bg text-navy rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                  {e.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold tracking-tighter text-ink truncate">
                    {e.name}
                    {!e.active && <span className="ml-2 text-[10px] text-ink-4 font-normal">(비활성)</span>}
                  </div>
                  <div className="text-[11px] text-ink-3">
                    {e.role === 'owner' ? '점주' : '직원'}
                    {e.hourlyWage != null && e.hourlyWage > 0 && (
                      <> · 시급 {formatKRW(e.hourlyWage)}원</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowEmployeeModal({ initial: e })}
                  className="text-[11px] text-ink-3 hover:text-navy font-bold px-2"
                >수정</button>
                <button
                  onClick={() => {
                    if (!confirm(`${e.name}을(를) 삭제하시겠어요? 근태 기록도 함께 삭제됩니다.`)) return;
                    employeeStore.delete(e.id);
                    attendanceStore.deleteByEmployee(e.id);
                    reload();
                  }}
                  className="text-[11px] text-ink-4 hover:text-alert font-bold px-2"
                >삭제</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 기록 조회 */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-[15px] font-bold tracking-tighter text-ink">기록 조회</div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={logDate}
              onChange={(e) => e.target.value && setLogDate(e.target.value)}
              className="px-3 py-1.5 border border-border-strong rounded-lg text-[13px] font-bold text-ink outline-none focus:border-accent font-serif-num"
            />
            <span className="text-[11px] text-ink-3">{dateRecords.length}건</span>
          </div>
        </div>
        {dateRecords.length === 0 ? (
          <div className="text-center py-6 text-[12px] text-ink-3">선택한 날짜에 기록이 없어요</div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {dateRecords.map((r) => {
              const emp = employees.find((e) => e.id === r.employeeId);
              return (
                <div key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className={[
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-[0.04em] flex-shrink-0',
                    r.type === 'check_in' ? 'bg-accent-bg text-accent' : 'bg-surface-alt text-ink-2',
                  ].join(' ')}>
                    {r.type === 'check_in' ? '출근' : '퇴근'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink tracking-tighter truncate">
                      {emp?.name ?? '(삭제된 직원)'}
                    </div>
                    {r.distanceM != null && (
                      <div className="text-[10px] text-ink-3">매장에서 {formatDistance(r.distanceM)}</div>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-3 font-serif-num flex-shrink-0">{formatTime(r.occurredAt)}</div>
                  <button
                    onClick={() => {
                      if (!confirm('이 기록을 삭제하시겠어요?')) return;
                      attendanceStore.delete(r.id);
                      reload();
                    }}
                    className="text-ink-4 hover:text-alert text-[14px] font-bold flex-shrink-0"
                    aria-label="기록 삭제"
                  >×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showStoreModal && (
        <StoreModal
          initial={store}
          onCancel={() => setShowStoreModal(false)}
          onSave={(data) => {
            storeStore.upsert(data);
            setShowStoreModal(false);
            reload();
          }}
        />
      )}

      {showEmployeeModal && (
        <EmployeeModal
          initial={showEmployeeModal.initial}
          onCancel={() => setShowEmployeeModal(null)}
          onSave={(data) => {
            if (showEmployeeModal.initial) {
              employeeStore.update(showEmployeeModal.initial.id, data);
            } else {
              employeeStore.create({ ...data, active: true });
            }
            setShowEmployeeModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// localStorage filter helper (모듈 내부 — 비공개)
function attendanceStore_listByDateLocal(records: AttendanceRecord[], ymd: string): AttendanceRecord[] {
  return records.filter((a) => {
    const d = new Date(a.occurredAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return k === ymd;
  });
}

// ============================================
// 매장 정보 모달
// ============================================
function StoreModal({
  initial, onCancel, onSave,
}: {
  initial: Store | null;
  onCancel: () => void;
  onSave: (data: Partial<Omit<Store, 'id' | 'createdAt' | 'updatedAt'>>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState<string>(initial?.lat?.toString() ?? '');
  const [lng, setLng] = useState<string>(initial?.lng?.toString() ?? '');
  const [radius, setRadius] = useState<string>((initial?.attendanceRadiusM ?? 100).toString());
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string>('');

  const useCurrentLocation = () => {
    setLocateError('');
    if (!('geolocation' in navigator)) {
      setLocateError('이 브라우저는 위치 정보를 지원하지 않아요.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) setLocateError('위치 권한이 거부되었어요.');
        else setLocateError('위치 확인 중 오류가 발생했어요.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const radiusNum = Number(radius);
  const canSave =
    name.trim().length > 0 &&
    !Number.isNaN(latNum) && !Number.isNaN(lngNum) &&
    radiusNum > 0;

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[480px] max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">매장 정보</div>
          <div className="text-[11px] text-ink-3 mt-0.5">출퇴근 위치 검증의 기준점이 됩니다.</div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-3">
          <Field label="매장명" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 갑부떡볶이 신촌점"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] outline-none focus:border-accent"
            />
          </Field>

          <Field label="주소 (선택)">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예: 서울 서대문구 ..."
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] outline-none focus:border-accent"
            />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-semibold text-ink-2 tracking-tighter">매장 좌표<span className="text-accent ml-0.5">*</span></label>
              <button
                onClick={useCurrentLocation}
                disabled={locating}
                className="text-[11px] text-accent font-bold hover:underline disabled:opacity-50"
              >{locating ? '확인 중...' : '📍 현재 위치 사용'}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number" inputMode="decimal" step="0.000001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="위도 (예: 37.555)"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent font-serif-num"
              />
              <input
                type="number" inputMode="decimal" step="0.000001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="경도 (예: 126.937)"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent font-serif-num"
              />
            </div>
            {locateError && <div className="text-[11px] text-alert mt-1.5 font-bold">{locateError}</div>}
            <div className="text-[10px] text-ink-3 mt-1.5">매장 안에서 "현재 위치 사용" 버튼을 누르는 게 가장 정확해요.</div>
          </div>

          <Field label="허용 반경 (m)" required>
            <input
              type="number" inputMode="numeric" min="10" step="10"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder="100"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] outline-none focus:border-accent font-serif-num"
            />
            <div className="text-[10px] text-ink-3 mt-1">기본 100m. 좁은 매장은 50m, 넓은 부지는 200m 정도가 적당해요.</div>
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 flex-shrink-0 bg-surface">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
          <button
            onClick={() => onSave({
              name: name.trim(),
              address: address.trim() || undefined,
              lat: latNum,
              lng: lngNum,
              attendanceRadiusM: radiusNum,
            })}
            disabled={!canSave}
            className="px-5 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >저장</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 직원 추가/수정 모달
// ============================================
function EmployeeModal({
  initial, onCancel, onSave,
}: {
  initial: Employee | null;
  onCancel: () => void;
  onSave: (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt' | 'active'> & { active?: boolean }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<EmployeeRole>(initial?.role ?? 'staff');
  const [hourlyWage, setHourlyWage] = useState<string>(initial?.hourlyWage?.toString() ?? '');
  const [active, setActive] = useState<boolean>(initial?.active ?? true);
  const [note, setNote] = useState(initial?.note ?? '');

  const wageNum = hourlyWage === '' ? undefined : Number(hourlyWage);
  const canSave = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[440px] max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">{initial ? '직원 수정' : '직원 추가'}</div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-3">
          <Field label="이름" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] outline-none focus:border-accent"
            />
          </Field>

          <Field label="역할" required>
            <div className="flex gap-2">
              {(['staff', 'owner'] as EmployeeRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={[
                    'flex-1 py-2.5 rounded-[10px] text-[13px] font-bold border',
                    role === r ? 'bg-navy text-white border-navy' : 'bg-surface text-ink-2 border-border-strong hover:border-navy/40',
                  ].join(' ')}
                >{r === 'owner' ? '점주' : '직원'}</button>
              ))}
            </div>
          </Field>

          <Field label="시급 (원, 선택)">
            <input
              type="number" inputMode="numeric" min="0"
              value={hourlyWage}
              onChange={(e) => setHourlyWage(e.target.value)}
              placeholder="예: 11000"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] outline-none focus:border-accent font-serif-num"
            />
            <div className="text-[10px] text-ink-3 mt-1">4차 인건비 계산 때 활용됩니다 (현재는 표시만).</div>
          </Field>

          {initial && (
            <Field label="활성 상태">
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-navy"
                />
                활성 (비활성으로 두면 출퇴근 셀렉트에서 숨겨짐)
              </label>
            </Field>
          )}

          <Field label="메모 (선택)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 평일 저녁만"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] outline-none focus:border-accent"
            />
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 bg-surface">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
          <button
            onClick={() => onSave({
              name: name.trim(),
              role,
              hourlyWage: wageNum != null && !Number.isNaN(wageNum) && wageNum > 0 ? wageNum : undefined,
              active,
              note: note.trim() || undefined,
            })}
            disabled={!canSave}
            className="px-5 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >저장</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-2 tracking-tighter mb-1.5">
        {label}{required && <span className="text-accent ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
