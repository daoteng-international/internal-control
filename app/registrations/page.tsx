"use client";

import { useMemo, useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";

import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

// 更新類型定義以符合 7 個階段
type RegStageId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
type CustomerTag = "一般客戶" | "VIP客戶" | "黃金客戶";
type TaxType = "應稅(5%)" | "免稅/未稅";

interface RegCard {
  id: string;
  title: string;          // 公司名
  customer: string;       // 客戶名
  customerTag: CustomerTag;
  owner: string;
  roomNo: string;         // 信件編號
  taxType: TaxType;
  actualRentExclTax: number;
  actualRentInclTax: number;
  contractMonths: number;
  totalContractAmount: number;
  stage: RegStageId;
  updatedAt: any;
  stageStartedAt: string;
  createdAt: string;
  productLines: string[];
  // 新增記錄欄位
  taxId: string;          // 統一編號
  branch: string;         // 館別
  billingCycle: string;   // 繳費週期
  monthlyRent: number;    // 月租費
  mailHandling: string;   // 信件處理
  email: string;          // Email
  phone: string;          // 電話
  accountant: string;     // 會計師
  shippingAddress: string;// 寄件地址
  specialNotes: string;   // 特殊需求
}

// 更新後的 7 個階段配置與完整訊息內容
const STAGES: { id: RegStageId; title: string; hint: string; checks: string[]; defaultMessage: string }[] = [
  { 
    id: "S1", 
    title: "S1 初步諮詢", 
    hint: "需求意向確認", 
    checks: ["客戶資料初步收集", "諮詢服務紀錄"],
    defaultMessage: `您好, 感謝{username}的來訊！😊
很高興能參與您的創業規劃！為了提供最準確的協助，想先請教您目前的進度是：

1.剛起步： 還在想名字／預查階段（需要了解設立流程）
2.已成熟： 公司已設立，單純想做地址遷移

我們這邊提供最彈性的**「借址登記」**方案，價格透明且含秘書服務。 您可以直接告訴我您的情況，讓我為您安排最適合的方案！ (花一分鐘填寫表：https://share-na2.hsforms.com/1sSy_Tfx3S3ivoDlkXvsMVg3gltz )
道騰DT會幫您做更近一步方案推薦～～

道騰商務空間
價格透明 ✅ 半年/月/2年繳
秘書支援 ✅ 現場+遠端
空間多元 ✅ 會議、接待、活動
顧問輔導 ✅ 深耕十年，專業經驗
後續支援 ✅ 顧客成功導向`
  },
  { 
    id: "S2", 
    title: "S2 方案說明", 
    hint: "產品組合建議", 
    checks: ["報價方案確認", "服務項目選定"],
    defaultMessage: `Hello, 
創業初期流程真的比較繁瑣，別擔心，我們來幫您化繁為簡！💪
開公司其實只要掌握這 5 個步驟，剩下的細節我們都可以協助：
1️⃣ 公司名： 先想好公司名稱＋營業項目
2️⃣ 預查： 線上申請名稱預查（🔗 https://reurl.cc/GNMqOD ）
3️⃣ 簽約： 這一步交給道騰！ 當名稱預查通過，我們提供合規的地址與合約書給您
4️⃣ 送件： 拿著合約與核定書，向政府-經發局申請設立
5️⃣ 啟動： 國稅局面談後，拿到統編，正式開張！

💡 道騰的價值： 我們不只提供地址，還有**「創業補助諮詢」與「銀行開戶對接」**，這比單純租地址對您幫助更大。 您目前手邊有配合的會計師了嗎？還是需要我們推薦專業夥伴給您參考呢？

延伸補充：
創業導航：https://reurl.cc/lab6qd
費用試算：https://dt-smart-virtue-office-404364429356.us-west1.run.app
新公司設立 📹 影片:https://reurl.cc/NNDbpk

創業課程＆最新消息：https://www.daoteng.org/news
高雄新創資源＆補助：https://www.daoteng.org/link-up-kaohsiung
數位升級：https://deltra.org

資源補帖：
要成立有限公司還是商行
🔗https://reurl.cc/o019XQ
公司設立的步驟
🔗https://reurl.cc/OVAXe3

最新的創業補助資源參考
上集｜🔗 https://reurl.cc/DAmx45
下集｜🔗 https://reurl.cc/mDlpy7

期待您的公司設立成功～～讓我們當您最強後盾！`
  },
  { 
    id: "S3", 
    title: "S3 報價", 
    hint: "價格條件提供", 
    checks: ["發送正式報價單", "確認客戶預算"],
    defaultMessage: `您好！

針對您的需求，我們推薦最受歡迎的 【年繳方案】
除了價格最優惠（換算下來每月僅需 $XXXX），最重要的是省去每月轉帳的行政瑣事，合約也是一年一簽最單純。

👉 詳細金額試算可以看這裡：https://www.daoteng.org/virtue-office-calc

如果方案沒問題，看您想預約
選擇簽約方式：現場/線上 (請選其一)

-->> 方式一：「現場簽約（順便參觀環境）」 還是
-->> 方式二：「線上簽約（快速方便）」 呢？

(簡單1分鐘填寫預約簽約表單)
https://share-na2.hsforms.com/17nO5cGLkTIWSsVH9z-dBow3gltz

預約簽約日期/時間：

客戶一致讚賞超值方案，立即行動吧！

＊備註：
📌 新公司借址登記：您需準備的文件清單
1. 負責人身份證影本： 用於簽訂虛擬辦公室合約。
2. 公司名稱預查核定書： 證明公司名稱與營業項目已核准。
3. 公司大小章： 用於合約簽署，建議先刻好。
影片說明: https://reurl.cc/W80Wre
方式一：「現場簽約（順便參觀環境）」 
 方式二：「線上簽約（快速方便）」 
以上可以簡單1分鐘填寫預約簽約表單：https://share-na2.hsforms.com/17nO5cGLkTIWSsVH9z-dBow3gltz 
預約簽約日期/時間：
客戶一致讚賞超值方案，立即行動吧！
備註：📌 新公司借址登記：您需準備的文件清單
1. 負責人身份證影本： 用於簽訂虛擬辦公室合約。
2. 公司名稱預查核定書： 證明公司名稱與營業項目已核准。
3. 公司大小章： 用於合約簽署，建議先刻好。
影片說明: https://reurl.cc/W80Wre`
  },
  { 
    id: "S4", 
    title: "S4 追蹤關懷", 
    hint: "客戶意願追蹤", 
    checks: ["關懷聯繫紀錄", "異議處理排除"],
    defaultMessage: `您好！
昨天傳給您的方案內容比較多，不知道有沒有哪邊說明不清楚的地方？
其實很多創業者在第一步（如：行業代碼、營業項目）會比較頭痛。如果這方面有疑問，都可以直接問我，我幫您看一下喔！不用客氣 😊

關於以下問題都可以一站式參照網址： https://www.daoteng.org/virtue-office-calc
- 營業項目＆稅務參考
- 常見工商登記 QA
- 工商登記7大流程
- 申請準備＆提供文件

在道騰，我們不只提供地址，更希望成為您創業路上的「神隊友」。 若有任何預算或地點的考量，歡迎隨時跟我說，我們都可以討論怎麼協助您喔！`
  },
  { 
    id: "S5", 
    title: "S5 簽約中", 
    hint: "合約流程執行", 
    checks: ["合約條款核對", "印鑑資料準備"],
    defaultMessage: `太好了！歡迎加入道騰的大家庭 🤝
為了縮短您當天簽約等待的時間，請協助先提供以下資料，秘書會預先幫您把合約準備好：
一、【請提供電子檔或照片】
1.預查核定書（或舊公司營登函）
2.負責人身分證（正反面）

二、【簽約當日請攜帶】
📍公司大小章

三、【請填寫基本資料-合約製作】
方式1: 填寫表單 https://share-na2.hsforms.com/17nO5cGLkTIWSsVH9z-dBow3gltz
方式2: 或手打資訊回覆
🏢 公司名稱：
👤 負責人姓名：
📍 聯繫地址：
📞 聯繫電話：
📧 Email(請款單寄送)：
🚨 緊急聯絡人&電話：
（重要！若稅務局聯繫不到負責人時的必要窗口）：

資料傳給我就可以囉！收到後我立刻為您安排。

四、【簽約地點】
(*)道騰民權館 Tel：(07) 963-5286 #99
(*)地址：高雄市新興區民權一路 251 號 21 樓
(*) Google 導覽：https://maps.app.goo.gl/JY4EuVnmeasMSPwDA
(*)停車資訊：https://www.daoteng.org/leek

欲了解完整的公司設立流程，可參考此教學文章說明：
🔗 https://reurl.cc/4megzY

【備註】
如有其他問題（如政府查驗、會計師代辦、報稅開戶流程等），我們也能提供配套資訊與專業協助。
以上資料完備簽約僅需約 15 分鐘。`
  },
  { 
    id: "S6", 
    title: "S6 成交", 
    hint: "正式結案簽署", 
    checks: ["完成合約簽署", "首筆款項入帳"],
    defaultMessage: `感謝您今天撥空前來簽約，合作愉快！🎊 很開心有為您服務的機會
這是您的公司登記資料，建議您存下來傳給會計師：
📮 收件提醒
收件人：請填寫簽約之公司名稱（※請勿僅填人名）
地址：800 高雄市新興區民權一路 251 號21樓

🧾 發票開立
若公司已設立並取得統編，請通知我們，將為您開立正式發票。

📆 合約續約機制
本合約採自動續約，無須再次親簽。到期前一個月，我們的客服將主動提醒您繳費事項。若提前終止，該期租金恕不退還，但您可選擇：全額折抵升級實體辦公室，或轉讓至同負責人名下之其他公司（需酌收手續費）。

💼 資源與活動
我們正積極配合勞動部與鳳凰創業計畫，推動創業輔導、補助媒合與進修課程。誠摯邀請您參與，掌握政策利多，拓展事業版圖。
新創最新消息＆補助👉 https://www.daoteng.org/news
創業知識＋👉https://www.daoteng.org/knowledge-base
創業鳳凰 👉https://beboss.wda.gov.tw/

未來有任何創業補助或會議室需求，隨時敲我，道騰就是您最強的後盾！🚀

預祝鴻圖大展`
  },
  { id: "S7", title: "S7 暫停", hint: "暫時停止跟進", checks: ["標記暫停原因", "預約未來聯繫"], defaultMessage: "" },
];

const CUSTOMER_TAGS: CustomerTag[] = ["一般客戶", "VIP客戶", "黃金客戶"];

function currency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

// 修正後的天數計算函數：從建立日期開始算，進入 S6/S7 停止
function getDaysDiff(createdAt: string, stage: RegStageId, updatedAt: any) {
  if (!createdAt) return 0;
  
  const start = new Date(createdAt);
  let end = new Date();

  if (stage === "S6" || stage === "S7") {
    if (updatedAt) {
      end = updatedAt.seconds ? new Date(updatedAt.seconds * 1000) : new Date(updatedAt);
    }
  }

  const diffTime = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

function CardBase({ item, isOverlay = false }: { item: RegCard; isOverlay?: boolean }) {
  const days = getDaysDiff(item.createdAt, item.stage, item.updatedAt);
  
  const isFinished = item.stage === "S6" || item.stage === "S7";
  
  // 天數標籤顏色邏輯
  let badgeStyle = "bg-slate-400 text-white"; 
  if (!isFinished) {
    if (days >= 14) {
      badgeStyle = "bg-red-800 text-white"; 
    } else if (days >= 7) {
      badgeStyle = "bg-red-500 text-white"; 
    } else {
      badgeStyle = "bg-rose-200 text-rose-800"; 
    }
  }

  const tagColors: Record<CustomerTag, string> = {
    一般客戶: "bg-white/60 text-slate-600 border border-slate-200",
    VIP客戶: "bg-amber-100 text-amber-700",
    黃金客戶: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div
      className={`relative rounded-xl border p-3 shadow-sm transition-all duration-200 ${
        isOverlay
          ? "bg-emerald-50 shadow-2xl ring-2 ring-emerald-600 scale-105 cursor-grabbing"
          : "bg-emerald-50/40 border-emerald-100 hover:bg-emerald-50 hover:ring-2 hover:ring-emerald-600 cursor-grab"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-bold text-slate-800 line-clamp-1 pr-12">{item.title}</div>
        <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm ${badgeStyle}`}>
          {isFinished ? `共耗時 ${days}天` : `已停留 ${days}天`}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="text-[11px] text-emerald-700/70 font-medium">{item.customer}</div>
      </div>

      <div className="flex justify-between items-end mt-auto">
        <div className="space-y-1">
          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-fit italic ${tagColors[item.customerTag]}`}>
            {item.customerTag}
          </div>
          <div className="text-sm font-bold text-emerald-700">{currency(item.totalContractAmount)}</div>
        </div>
        <span className="text-[10px] text-emerald-600/50 italic font-medium">ID: {item.roomNo || "代辦"}</span>
      </div>
    </div>
  );
}

function SortableCard({ item, onClick }: { item: RegCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className={isDragging ? "opacity-30" : ""}>
      <CardBase item={item} />
    </div>
  );
}

function StageColumn({
  stage,
  cards,
  onCardClick,
}: {
  stage: (typeof STAGES)[0];
  cards: RegCard[];
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-full w-[320px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm shrink-0 self-stretch overflow-hidden"
    >
      <div className="p-4 pb-3 shrink-0 bg-white">
        <h3 className="font-bold text-sm text-slate-800 flex items-center justify-between">
          {stage.title}
          <span className="bg-slate-200/50 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{cards.length}</span>
        </h3>
        <div className="mt-3 h-px bg-slate-100" />
      </div>

      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-0 px-4 pt-4 pb-5 space-y-4">
          {cards.map((item) => (
            <SortableCard key={item.id} item={item} onClick={() => onCardClick(item.id)} />
          ))}

          {cards.length === 0 && <div className="min-h-[140px] border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/40" />}
        </div>
      </SortableContext>
    </div>
  );
}

function ConfirmModal({
  show,
  onConfirm,
  onCancel,
  stageId,
  cardTitle,
  cards
}: {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  stageId: RegStageId | null;
  cardTitle: string;
  cards: RegCard[];
}) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (show && stageId) {
      const stageInfo = STAGES.find((s) => s.id === stageId);
      const activeCard = cards.find(c => c.title === cardTitle);
      const username = activeCard?.customer || "客戶";
      
      // 抓取各階段設定的訊息並替換變數
      let customMsg = stageInfo?.defaultMessage || "";
      customMsg = customMsg.replace(/{username}/g, username);
      
      setMessage(customMsg);
    }
  }, [show, stageId, cardTitle, cards]);

  if (!show || !stageId) return null;
  const stageInfo = STAGES.find((s) => s.id === stageId);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message);
    alert("訊息已複製！");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="p-6">
          <h3 className="text-xl font-bold text-slate-800">進度移動確認</h3>
          <p className="text-sm text-slate-500 mt-2">
            將 <span className="font-bold text-slate-800 underline decoration-blue-500">{cardTitle}</span> 移至{" "}
            <span className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-bold ml-1">{stageInfo?.title}</span> ？
          </p>

          <div className="mt-6 space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-blue-600 mb-3 tracking-wider">該階段內控核對清單：</p>
              <ul className="space-y-2">
                {stageInfo?.checks.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-slate-700 font-medium">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                 <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                 <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
                   <span className="text-lg">📱</span> 已傳送 line@ 通知客戶
                 </span>
              </div>
              <div className="relative group">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full h-48 p-3 text-sm text-slate-600 bg-blue-50/30 border border-blue-100 rounded-lg outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                />
                <button
                  onClick={copyToClipboard}
                  className="absolute bottom-3 right-3 bg-blue-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                >
                  複製內容
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 flex gap-3 border-t">
          <button onClick={onConfirm} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black transition-all">
            確認移動
          </button>
          <button onClick={onCancel} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailDrawer({
  item,
  isCreate,
  onClose,
  onSave,
}: {
  item: RegCard | null;
  isCreate: boolean;
  onClose: () => void;
  onSave: (data: RegCard) => void;
}) {
  const [formData, setFormData] = useState<Partial<RegCard>>({});
  const [activeTab, setActiveTab] = useState<"basic" | "special">("basic");

  useEffect(() => {
    if (isCreate) {
      setFormData({
        id: `R-${Date.now()}`,
        stage: "S1",
        customerTag: "一般客戶",
        stageStartedAt: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString().split("T")[0],
        updatedAt: "",
        actualRentExclTax: 0,
        actualRentInclTax: 0,
        contractMonths: 0,
        totalContractAmount: 0,
        roomNo: "",
        owner: "未定",
        taxType: "應稅(5%)",
        productLines: ["工商登記"],
        taxId: "",
        branch: "",
        billingCycle: "",
        monthlyRent: 0,
        mailHandling: "",
        email: "",
        phone: "",
        accountant: "",
        shippingAddress: "",
        specialNotes: "",
      });
    } else if (item) {
      setFormData(item);
    }
  }, [item, isCreate]);

  if (!item && !isCreate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-slate-800">{isCreate ? "🆕 新增工商登記案件" : "📝 編輯案件詳情"}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl hover:text-slate-600 transition-colors">
            ✕
          </button>
        </header>

        <div className="flex px-8 border-b bg-slate-50/50">
          <button onClick={() => setActiveTab("basic")} className={`py-4 px-6 text-sm font-bold transition-all border-b-2 ${activeTab === "basic" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}>基本資訊</button>
          <button onClick={() => setActiveTab("special")} className={`py-4 px-6 text-sm font-bold transition-all border-b-2 ${activeTab === "special" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}>特殊需求紀錄</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          {activeTab === "basic" ? (
            <section className="space-y-6">
              <h3 className="text-sm font-bold border-l-4 border-blue-600 pl-3 text-slate-800 uppercase tracking-widest">客戶基本資訊</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-amber-600">★ 客戶類別標籤</label>
                  <div className="flex flex-wrap gap-2">{CUSTOMER_TAGS.map((t) => (<button key={t} onClick={() => setFormData({ ...formData, customerTag: t })} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${formData.customerTag === t ? "bg-amber-600 text-white border-amber-600 shadow-md" : "bg-white text-slate-500 border-slate-200"}`}>{t}</button>))}</div>
                </div>
                <div className="col-span-2"><label className="text-xs font-bold text-slate-500">公司全銜</label><input placeholder="請輸入完整公司名稱" value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600 font-medium" /></div>
                <div><label className="text-xs font-bold text-slate-500">客戶名 (聯絡人)</label><input placeholder="聯絡人姓名" value={formData.customer || ""} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">信件編號</label><input placeholder="Room No." value={formData.roomNo || ""} onChange={(e) => setFormData({ ...formData, roomNo: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">統一編號</label><input placeholder="8碼統編" value={formData.taxId || ""} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">館別</label><input placeholder="分館名稱" value={formData.branch || ""} onChange={(e) => setFormData({ ...formData, branch: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">繳費週期</label><input placeholder="例：月繳/季繳" value={formData.billingCycle || ""} onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">月租費</label><input type="number" value={formData.monthlyRent || 0} onChange={(e) => setFormData({ ...formData, monthlyRent: Number(e.target.value) })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">Email</label><input placeholder="電子信箱" value={formData.email || ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">電話</label><input placeholder="聯絡電話" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div className="col-span-2"><label className="text-xs font-bold text-slate-500">信件處理</label><input placeholder="處理規則描述" value={formData.mailHandling || ""} onChange={(e) => setFormData({ ...formData, mailHandling: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div><label className="text-xs font-bold text-slate-500">會計師</label><input placeholder="對接會計師姓名" value={formData.accountant || ""} onChange={(e) => setFormData({ ...formData, accountant: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
                <div className="col-span-2"><label className="text-xs font-bold text-slate-500">寄件地址</label><input placeholder="合約或信件寄送地址" value={formData.shippingAddress || ""} onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })} className="w-full border-b py-2 text-sm outline-none focus:border-blue-600" /></div>
              </div>
            </section>
          ) : (
            <section className="h-full">
              <label className="text-xs font-bold text-slate-500 block mb-4">案件特殊需求描述</label>
              <textarea placeholder="請在此輸入客戶的特殊客製化要求或背景資訊..." value={formData.specialNotes || ""} onChange={(e) => setFormData({ ...formData, specialNotes: e.target.value })} className="w-full h-96 p-4 border rounded-2xl text-sm outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 bg-slate-50/50 transition-all resize-none" />
            </section>
          )}
        </div>

        <footer className="p-6 border-t bg-slate-50">
          <button onClick={() => onSave(formData as RegCard)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all hover:bg-black">儲存並發佈</button>
        </footer>
      </div>
    </div>
  );
}

export default function RegistrationsPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<CustomerTag | "全部">("全部");

  const [cards, setCards] = useState<RegCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ activeId: string; toStage: RegStageId } | null>(null);

  useEffect(() => {
    setHasMounted(true);

    const q = query(collection(db, "members"), where("productLines", "array-contains", "工商登記"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || data.name || "新案件",
          customer: data.customer || data.contactPerson || "未填寫",
          customerTag: (data.customerTag as CustomerTag) || "一般客戶",
          roomNo: data.roomNo || data.id || "",
          totalContractAmount: data.totalContractAmount || 0,
          stage: (data.stage as RegStageId) || "S1",
          stageStartedAt: data.stageStartedAt || new Date().toISOString().split("T")[0],
          createdAt: data.createdAt || new Date().toISOString().split("T")[0],
          productLines: data.productLines || ["工商登記"],
          updatedAt: data.updatedAt || "",
          taxId: data.taxId || "",
          branch: data.branch || "",
          billingCycle: data.billingCycle || "",
          monthlyRent: data.monthlyRent || 0,
          mailHandling: data.mailHandling || "",
          email: data.email || "",
          phone: data.phone || "",
          accountant: data.accountant || "",
          shippingAddress: data.shippingAddress || "",
          specialNotes: data.specialNotes || "",
        };
      }) as RegCard[];

      setCards(casesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      const matchTag = filterTag === "全部" || c.customerTag === filterTag;
      const matchSearch =
        (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customer || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchTag && matchSearch;
    });
  }, [cards, filterTag, searchQuery]);

  const byStage = useMemo(() => {
    const map = new Map<RegStageId, RegCard[]>();
    STAGES.forEach((s) => map.set(s.id, []));
    filteredCards.forEach((c) => {
      if (map.has(c.stage)) {
        map.get(c.stage)!.push(c);
      }
    });
    return map;
  }, [filteredCards]);

  const handleSave = async (data: RegCard) => {
    try {
      if (isCreating) {
        await addDoc(collection(db, "members"), {
          ...data,
          name: data.title,
          contactPerson: data.customer,
          createdAt: new Date().toISOString().split("T")[0],
          updatedAt: serverTimestamp(),
          stageStartedAt: new Date().toISOString().split("T")[0],
          productLines: ["工商登記"],
        });
      } else {
        const docRef = doc(db, "members", data.id);
        const { id, ...updateData } = data;
        await updateDoc(docRef, {
          ...updateData,
          name: data.title,
          contactPerson: data.customer,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("Firebase Error:", e);
    }
    setIsCreating(false);
    setSelectedId(null);
  };

  const handleConfirmMove = async () => {
    if (!pendingMove) return;
    const docRef = doc(db, "members", pendingMove.activeId);
    
    await updateDoc(docRef, {
      stage: pendingMove.toStage,
      stageStartedAt: new Date().toISOString().split("T")[0],
      updatedAt: serverTimestamp(),
    });
    setPendingMove(null);
  };

  const activeCard = useMemo(() => cards.find((c) => c.id === activeId), [activeId, cards]);

  if (!hasMounted || loading) {
    return (
      <div className="flex-1 h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400 animate-pulse tracking-widest uppercase">
        系統同步中...
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-50/50 overflow-hidden">
      <header className="p-8 shrink-0 bg-white border-b shadow-sm z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight italic decoration-blue-500/30 underline">
              工商登記管理看板
            </h1>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">追蹤 S1 至 S7 階段流程</p>
          </div>

          <div className="flex gap-4 items-center">
            <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "kanban" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                }`}
              >
                看板模式
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                }`}
              >
                列表顯示
              </button>
            </div>

            <button
              onClick={() => setIsCreating(true)}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all"
            >
              + 新增案件
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <input
            type="text"
            placeholder="搜尋公司名稱或客戶..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm w-72 outline-none focus:ring-4 focus:ring-blue-500/10 bg-slate-50/50 transition-all"
          />

          <div className="flex gap-2">
            <button
              onClick={() => setFilterTag("全部")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                filterTag === "全部"
                  ? "bg-slate-800 text-white shadow-md"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              全部
            </button>

            {CUSTOMER_TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setFilterTag(t)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  filterTag === t
                    ? "bg-amber-600 text-white shadow-md"
                    : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 px-8 pt-6 pb-6 overflow-hidden flex flex-col">
        {viewMode === "kanban" ? (
          <div className="board-scroll flex-1 min-h-0 overflow-auto custom-scrollbar rounded-b-2xl">
            <DndContext
              sensors={sensors}
              onDragStart={(e) => setActiveId(String(e.active.id))}
              onDragEnd={(e) => {
                const { active, over } = e;
                setActiveId(null);
                if (!over) return;

                const aId = String(active.id);
                const oId = String(over.id);

                let toStage = oId as RegStageId;
                if (!STAGES.some((s) => s.id === oId)) {
                  toStage = cards.find((c) => c.id === oId)?.stage as RegStageId;
                }

                if (toStage && cards.find((c) => c.id === aId)?.stage !== toStage) {
                  setPendingMove({ activeId: aId, toStage });
                }
              }}
            >
              <div className="inline-flex h-full min-h-0 gap-8 items-stretch pr-8 pb-8">
                {STAGES.map((s) => (
                  <StageColumn key={s.id} stage={s} cards={byStage.get(s.id) || []} onCardClick={setSelectedId} />
                ))}
              </div>

              {createPortal(
                <DragOverlay dropAnimation={{ duration: 250, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                  {activeCard ? <CardBase item={activeCard} isOverlay /> : null}
                </DragOverlay>,
                document.body
              )}
            </DndContext>
          </div>
        ) : (
          <div className="inline-flex gap-8 items-stretch pr-8 min-h-full pb-6">
          </div>
        )}
      </main>

      <DetailDrawer
        item={cards.find((c) => c.id === selectedId) || null}
        isCreate={isCreating}
        onClose={() => {
          setSelectedId(null);
          setIsCreating(false);
        }}
        onSave={handleSave}
      />

      <ConfirmModal
        show={!!pendingMove}
        onConfirm={handleConfirmMove}
        onCancel={() => setPendingMove(null)}
        stageId={pendingMove?.toStage || null}
        cardTitle={cards.find((c) => c.id === pendingMove?.activeId)?.title || "案件"}
        cards={cards}
      />

      <style jsx global>{`
        .board-scroll {
          scrollbar-gutter: stable both-edges;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
          border: 3px solid #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}