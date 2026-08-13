"use client";

// app/proposals/[id]/print/page.tsx
// 提案列印預覽：畫面即 A4 版面，按列印後於瀏覽器對話框選「另存為 PDF」

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

import {
  Proposal,
  ProposalRoomItem,
  PAIN_POINT_GROUPS,
  DOC_TEXT,
  optionText,
  formatDocDate,
  currency,
  withTax,
} from "@/lib/types/proposal";

/* ---------- 小元件 ---------- */

function SectionTitle({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 mb-4 pb-2 border-b-2 border-slate-800">
      <span className="text-[10px] font-black tracking-[0.2em] text-slate-400">{index}</span>
      <h2 className="text-base font-bold text-slate-900 tracking-wide">{children}</h2>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="py-2 border-b border-slate-100">
      <div className="text-[9px] font-bold text-slate-400 tracking-widest mb-1">{label}</div>
      <div className="text-sm text-slate-800 font-medium">{value || "—"}</div>
    </div>
  );
}

/* ---------- 主頁 ---------- */

export default function ProposalPrintPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "proposals", id));
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          setProposal({ ...(snap.data() as Proposal), id: snap.id });
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [id, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center font-bold text-slate-400">
        正在載入提案內容…
      </div>
    );
  }

  if (notFound || !proposal) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm font-bold text-slate-500">找不到這份提案</p>
        <button
          onClick={() => router.push("/proposals")}
          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold"
        >
          回到提案列表
        </button>
      </div>
    );
  }

  const p = proposal;
  // 客戶文件一律以英文輸出；英文欄位缺值時各欄位會自動退回中文內容
  const isEn = (p.lang || "en") === "en";
  const T = DOC_TEXT[isEn ? "en" : "zh"];
  const pick = (zh?: string, en?: string) => (isEn ? (en && en.trim()) || zh || "" : zh || "");
  const rooms = p.rooms || [];
  const fb = p.freeBenefits;
  const ao = p.paidAddOns;
  const painKeys = Object.keys(p.painPoints || {});

  // 有勾選任何一項免費贈送或加購，才需要印出加值服務區塊
  const hasFree =
    fb && (fb.meetingRoom.enabled || fb.cleaning.enabled || fb.businessRegistration.enabled || fb.custom.enabled);
  const hasPaid = ao && (ao.printing.enabled || ao.parking.enabled || ao.phoneService.enabled);

  const taxLabel = p.taxIncluded ? T.taxIncluded : T.taxExcluded;

  // 照片集取主推房型；沒有指定主推時退回第一間有多張照片的房型
  const galleryRoom =
    rooms.find((r) => r.isRecommended && (r.photoUrls?.length || 0) > 1) ||
    rooms.find((r) => (r.photoUrls?.length || 0) > 1);
  // 第一張已在比價表當封面，這裡只放其餘照片
  const galleryPhotos = (galleryRoom?.photoUrls || []).slice(1, 5);

  return (
    <div id="print-root" className="print-root bg-slate-100 min-h-screen">
      {/* 工具列：列印時隱藏 */}
      <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/proposals")}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold"
          >
            ← 返回
          </button>
          <div>
            <div className="text-sm font-bold text-slate-800">{p.companyName}</div>
            <div className="text-[11px] font-mono text-slate-400">
              {p.proposalNo}　{p.version}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">
            列印時請選擇「另存為 PDF」，邊界設為預設、勾選背景圖形
          </span>
          <button
            onClick={() => window.print()}
            className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-black"
          >
            列印 / 匯出 PDF
          </button>
        </div>
      </div>

      {/* A4 紙張 */}
      <div className="py-10 flex justify-center">
        <div className="paper bg-white shadow-xl">
          {/* ---------- 信頭 ---------- */}
          <header className="flex justify-between items-start pb-6 mb-8 border-b-4 border-slate-900">
            <div>
              <div className="text-[10px] font-black tracking-[0.3em] text-slate-400 mb-2">
                {T.brand.toUpperCase()}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-wide">
                {T.docTitle}
              </h1>
              <p className="text-xs text-slate-500 mt-2">
                {T.addressee} {p.companyName}
                {p.guestName && `　${p.guestName}`}
                {p.guestTitle && ` ${p.guestTitle}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <table className="text-[10px] text-slate-600">
                <tbody>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">{T.proposalNo}</td>
                    <td className="font-mono font-bold">{p.proposalNo}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">{T.version}</td>
                    <td className="font-bold">{p.version}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">{T.visitDate}</td>
                    <td className="font-bold">{formatDocDate(p.visitDate, isEn)}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">{T.validUntil}</td>
                    <td className="font-bold text-red-600">{formatDocDate(p.validUntil, isEn)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </header>

          {/* V2 調整說明 */}
          {p.version === "V2" && p.versionNote && (
            <div className="mb-8 p-5 bg-amber-50 border-l-4 border-amber-500">
              <div className="text-[10px] font-black tracking-widest text-amber-700 mb-2">
                {T.versionNote}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {p.versionNote}
              </p>
            </div>
          )}

          {/* ---------- 需求摘要 ---------- */}
          <section className="mb-10">
            <SectionTitle index="01">{T.s1}</SectionTitle>
            <div className="grid grid-cols-4 gap-x-8">
              <InfoCell label={T.headcount} value={p.headcount ? `${p.headcount} ${T.people}` : ""} />
              <InfoCell label={T.moveIn} value={formatDocDate(p.moveInDate, isEn)} />
              <InfoCell label={T.spaceType} value={(p.spaceTypes || []).map(t => optionText(t, isEn)).join(isEn ? ", " : "、")} />
              <InfoCell label={T.officeStatus} value={optionText(p.officeStatus || "", isEn)} />
            </div>
          </section>

          {/* ---------- 比價表 ---------- */}
          <section className="mb-10">
            <SectionTitle index="02">{T.s2}</SectionTitle>

            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-24 text-left align-bottom pb-3 text-[9px] font-bold text-slate-400 tracking-widest">
                    {T.compareItem}
                  </th>
                  {rooms.map((r) => (
                    <th
                      key={r.roomId}
                      className={`align-bottom pb-3 pl-4 text-left ${
                        r.isRecommended ? "bg-amber-50" : ""
                      }`}
                    >
                      {r.isRecommended && (
                        <div className="inline-block text-[8px] font-black bg-amber-500 text-white px-2 py-0.5 mb-1.5">
                          {T.recommended}
                        </div>
                      )}
                      <div className="text-lg font-bold text-slate-900 leading-none">
                        {r.roomNo}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">{pick(r.floorName, r.floorNameEn)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 照片 */}
                {rooms.some((r) => r.photoUrls?.length) && (
                  <tr>
                    <td className="text-[10px] font-bold text-slate-400 py-3 align-top">
                      {T.photos}
                    </td>
                    {rooms.map((r) => (
                      <td
                        key={r.roomId}
                        className={`py-3 pl-4 align-top ${r.isRecommended ? "bg-amber-50/50" : ""}`}
                      >
                        {r.photoUrls?.[0] ? (
                          <img
                            src={r.photoUrls[0]}
                            alt={r.roomNo}
                            className="w-full h-28 object-cover"
                          />
                        ) : (
                          <div className="w-full h-28 bg-slate-50" />
                        )}
                      </td>
                    ))}
                  </tr>
                )}

                {[
                  { label: T.area, get: (r: ProposalRoomItem) => `${r.areaPing}${isEn ? "" : " 坪"}` },
                  { label: T.capacity, get: (r: ProposalRoomItem) => `${r.capacityMax} ${T.people}` },
                  { label: T.feature, get: (r: ProposalRoomItem) => pick(r.featureDesc, r.featureDescEn) || "—" },
                ].map((row) => (
                  <tr key={row.label} className="border-t border-slate-100">
                    <td className="text-[10px] font-bold text-slate-400 py-2.5 align-top">
                      {row.label}
                    </td>
                    {rooms.map((r) => (
                      <td
                        key={r.roomId}
                        className={`py-2.5 pl-4 text-xs text-slate-700 align-top ${
                          r.isRecommended ? "bg-amber-50/50" : ""
                        }`}
                      >
                        {row.get(r)}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className="border-t-2 border-slate-200">
                  <td className="text-[10px] font-bold text-slate-400 py-2.5">{T.priceBase}</td>
                  {rooms.map((r) => (
                    <td
                      key={r.roomId}
                      className={`py-2.5 pl-4 text-xs text-slate-500 line-through ${
                        r.isRecommended ? "bg-amber-50/50" : ""
                      }`}
                    >
                      {currency(withTax(r.priceBase, p.taxIncluded))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="text-[10px] font-bold text-slate-400 py-2.5">{T.priceHalf}</td>
                  {rooms.map((r) => (
                    <td
                      key={r.roomId}
                      className={`py-2.5 pl-4 text-sm font-bold text-slate-700 ${
                        r.isRecommended ? "bg-amber-50/50" : ""
                      }`}
                    >
                      {currency(withTax(r.priceHalfYear, p.taxIncluded))}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="text-[10px] font-black text-slate-800 py-3">{T.priceYear}</td>
                  {rooms.map((r) => (
                    <td
                      key={r.roomId}
                      className={`py-3 pl-4 ${r.isRecommended ? "bg-amber-50/50" : ""}`}
                    >
                      <div className="text-xl font-black text-slate-900 leading-none">
                        {currency(withTax(r.priceYearly, p.taxIncluded))}
                      </div>
                      {r.priceBase > r.priceYearly && (
                        <div className="text-[9px] font-bold text-red-600 mt-1">
                          {T.saveYear} {currency(withTax((r.priceBase - r.priceYearly) * 12, p.taxIncluded))}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>

                <tr className="border-t-2 border-slate-200">
                  <td className="text-[10px] font-bold text-slate-400 py-3 align-top">
                    {T.acRule}
                  </td>
                  {rooms.map((r) => (
                    <td
                      key={r.roomId}
                      className={`py-3 pl-4 align-top ${r.isRecommended ? "bg-amber-50/50" : ""}`}
                    >
                      <div className="text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {pick(r.acTemplate, r.acTemplateEn) || "—"}
                      </div>
                    </td>
                  ))}
                </tr>

                {rooms.some((r) => r.customNote?.trim()) && (
                  <tr className="border-t border-slate-100">
                    <td className="text-[10px] font-bold text-slate-400 py-3 align-top">{T.note}</td>
                    {rooms.map((r) => (
                      <td
                        key={r.roomId}
                        className={`py-3 pl-4 text-[10px] text-slate-600 leading-relaxed align-top ${
                          r.isRecommended ? "bg-amber-50/50" : ""
                        }`}
                      >
                        {r.customNote || "—"}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>

            <p className="text-[9px] text-slate-400 mt-3">
              {T.priceFooter(taxLabel, formatDocDate(p.validUntil, isEn))}
            </p>
          </section>

          {/* ---------- 加值服務 ---------- */}
          {(hasFree || hasPaid) && (
            <section className="mb-10 break-inside-avoid">
              <SectionTitle index="03">{T.s3}</SectionTitle>

              {hasFree && (
                <div className="mb-6">
                  <div className="text-[10px] font-black tracking-widest text-emerald-700 mb-3">
                    {T.freeTitle}
                  </div>
                  <div className="space-y-2">
                    {fb.meetingRoom.enabled && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-emerald-600 font-black text-xs">✓</span>
                        <span className="text-sm font-bold text-slate-800 w-40">{T.meetingRoom}</span>
                        <span className="text-sm text-slate-600">
                          {T.meetingRoomValue(fb.meetingRoom.hoursPerMonth)}
                        </span>
                      </div>
                    )}
                    {fb.cleaning.enabled && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-emerald-600 font-black text-xs">✓</span>
                        <span className="text-sm font-bold text-slate-800 w-40">{T.cleaning}</span>
                        <span className="text-sm text-slate-600">
                          {T.cleaningValue(fb.cleaning.timesPerMonth)}
                        </span>
                      </div>
                    )}
                    {fb.businessRegistration.enabled && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-emerald-600 font-black text-xs">✓</span>
                        <span className="text-sm font-bold text-slate-800 w-40">{T.businessReg}</span>
                        <span className="text-xs text-slate-600 flex-1 leading-relaxed">
                          {pick(fb.businessRegistration.note, fb.businessRegistration.noteEn)}
                        </span>
                      </div>
                    )}
                    {fb.custom.enabled && (fb.custom.text || fb.custom.textEn) && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-emerald-600 font-black text-xs">✓</span>
                        <span className="text-sm text-slate-700 flex-1">{pick(fb.custom.text, fb.custom.textEn)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {hasPaid && (
                <div>
                  <div className="text-[10px] font-black tracking-widest text-slate-500 mb-3">
                    {T.paidTitle}
                  </div>
                  <div className="space-y-2">
                    {ao.printing.enabled && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-800 w-40">{T.printing}</span>
                        <span className="text-sm text-slate-600">
                          {T.printingValue(ao.printing.bwPrice, ao.printing.colorPrice)}
                        </span>
                      </div>
                    )}
                    {ao.parking.enabled && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-800 w-40">{T.parking}</span>
                        <span className="text-sm text-slate-600">
                          {T.parkingValue(optionText(ao.parking.type, isEn), ao.parking.monthlyFee)}
                        </span>
                      </div>
                    )}
                    {ao.phoneService.enabled && (
                      <div className="flex gap-3 items-baseline py-2 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-800 w-40">{T.phone}</span>
                        <span className="text-xs text-slate-600 flex-1 leading-relaxed">
                          {pick(ao.phoneService.note, ao.phoneService.noteEn)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ---------- 痛點對策 ---------- */}
          {painKeys.length > 0 && (
            <section className="mb-10 break-inside-avoid">
              <SectionTitle index="04">{T.s4}</SectionTitle>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {T.painIntro}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {PAIN_POINT_GROUPS.filter((g) => painKeys.includes(g.key)).map((g) => {
                  const state = p.painPoints[g.key];
                  const items = [...(state.items || [])];
                  if (state.otherText?.trim()) items.push(state.otherText.trim());
                  return (
                    <div key={g.key} className="border border-slate-200 p-4">
                      <div className="text-xs font-black text-slate-800 mb-2">{optionText(g.label, isEn)}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((it, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1"
                          >
                            {optionText(it, isEn)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---------- 主推房型的其餘照片 ----------
              比價表每欄只有約 40mm 寬，塞多張照片會讓表格過高又看不清，
              因此表格只放封面，其餘照片集中在此區塊呈現 */}
          {galleryRoom && galleryPhotos.length > 0 && (
            <section className="mb-10 break-inside-avoid">
              <SectionTitle index="05">{T.gallery}</SectionTitle>
              <p className="text-xs text-slate-500 mb-4">
                {T.galleryOf(galleryRoom.roomNo)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {galleryPhotos.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`${galleryRoom.roomNo} ${i + 2}`}
                    className="w-full h-40 object-cover"
                  />
                ))}
              </div>
            </section>
          )}

          {/* ---------- 頁尾 ---------- */}
          <footer className="mt-12 pt-6 border-t-2 border-slate-900 flex justify-between items-end">
            <div>
              <div className="text-[9px] font-bold text-slate-400 tracking-widest mb-1">
                {T.sales}
              </div>
              <div className="text-sm font-bold text-slate-800">{p.salesName || "—"}</div>
            </div>
            <div className="text-right text-[9px] text-slate-400 leading-relaxed">
              <div>{T.confidential}</div>
              <div>
                {p.proposalNo}　{p.version}　{T.printedOn} {new Date().toLocaleDateString(isEn ? "en-US" : "zh-TW")}
              </div>
            </div>
          </footer>
        </div>
      </div>

      <style jsx global>{`
        .paper {
          width: 210mm;
          min-height: 297mm;
          padding: 16mm 15mm;
          box-sizing: border-box;
        }

        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          html,
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            position: static !important;
          }

          /* --- 攤平 layout.tsx 的結構 ---
             外層是 flex 容器，<main> 帶有 relative 與 overflow-hidden，
             會讓內容被側邊欄推開並在右側被裁掉，列印時全部還原成一般區塊 */
          body > div {
            display: block !important;
            min-height: 0 !important;
            width: 210mm !important;
          }

          main {
            position: static !important;
            overflow: visible !important;
            width: 210mm !important;
            max-width: 210mm !important;
            flex: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 側邊欄不列印 */
          aside {
            display: none !important;
          }

          /* AI 助理等浮動元件不在本頁元件內，用 visibility 逐層隱藏後
             再單獨把提案內容顯示出來，不需知道 layout 包了幾層 */
          body * {
            visibility: hidden !important;
          }

          #print-root,
          #print-root * {
            visibility: visible !important;
          }

          #print-root {
            position: static !important;
            width: 210mm !important;
            max-width: 210mm !important;
            background: #fff !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          /* 包住紙張的置中容器在列印時不需要外距 */
          #print-root > div {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          .paper {
            box-shadow: none !important;
            width: 210mm !important;
            max-width: 210mm !important;
            min-height: auto;
            margin: 0 !important;
          }

          /* 主推方案底色與照片要能印出來 */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          table {
            break-inside: avoid;
          }
          .break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
