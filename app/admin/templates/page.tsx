"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  addDoc,
  getDocs,    // 💡 新增這一行
  deleteDoc   // 💡 新增這一行
} from "firebase/firestore";

// 定義初始範本內容
const INITIAL_TEMPLATES = [
  { label: "S1 初步諮詢 - 需求蒐集", category: "辦公室出租", content: "感謝您的來訊！ 可以簡單提供以下資料或詳細說明,有助於提供最合適您的辦公室~ \n預計使用人數： \n預算範圍： \n方便參觀時間： \n我們將立即安排專員與您聯繫，提供專屬方案 「我們不是最便宜，但最划算——讓創業者安心、快速展開。」" },
  { label: "S1 初步諮詢 - 報價制度說明", category: "辦公室出租", content: "我們的報價採全包制，已包含物業管理、高速網路、水費以及公共區域清潔。電費部分則是採獨立電表計算（或視專案包含），讓您的營運成本更單純好控管。" },
  { label: "S1 初步諮詢 - 彈性方案推薦", category: "辦公室出租", content: "沒問題！我們提供高度彈性的租期方案，從單日行動位到按月計費的獨立辦公室皆有。請問您預計的使用人數與起始日期是？" },
  { label: "S2 對齊需求 - 空間規格提供", category: "辦公室出租", content: "感謝您提供的資訊，為了預備最合適您的辦公室方案，這裡先提供我們目前的空間規格給您參考。" },
  { label: "S3 方案建議 - 3個首選方案", category: "辦公室出租", content: "您好，感謝您的耐心等待！根據您的需求，我整理了以下 3 個首選方案：\n\n【方案建議】\n[型號 A]：高效率空間，約 $[金額]/月（專注首選）\n[型號 B]：大面採光間，約 $[金額]/月（形象首選）\n[型號 C]：高 CP 值基本間，約 $[金額]/月（創業首選）\n\n【選擇我們的隱形優勢】\n真正全包：免水電、管理費、清潔費，營運成本超單純。\n企業門面：專業秘書接待訪客，提升您的商務形象。\n即刻入駐：桌椅俱全，省下裝潢與等待時間，帶電腦即可開工。\n優質社群：定期舉辦商務連結活動，入駐即擁有現成資源。\n\n照片看百遍，不如現場看一遍。本週 [日期/時間] 方便" },
  { label: "S3 方案建議 - 簽約優惠爭取", category: "辦公室出租", content: "這份報價已包含目前最完整的商務配套。如果您願意一次簽約一年（年繳），或是近期內完成簽約，我可以幫您向公司爭取額外的優惠折扣或贈送會議室時數。" },
  { label: "S4 邀請參觀 - 現場感官體驗", category: "辦公室出租", content: "以上是為您初步篩選的空間方案。照片與規格只能呈現硬體，辦公室的氛圍與服務能量建議您親自感受。建議撥冗 30 分鐘現場參觀，邀請您過來喝杯咖啡，親自確認空間細節嗎？現場參觀將能為您爭取更合適的入駐優惠！我能現場為您說明入駐後的商務資源與配套服務。\n您可以跟我說一個方便的時段?" },
  { label: "S4 邀請參觀 - 續約通知彈性", category: "辦公室出租", content: "合約條款是為了保障雙方的營運權益。關於您在意的部分，我們可以討論是否透過縮短續約通知期來增加彈性，這樣對您的風險較低，也不會更動到核心合約架構。" },
  { label: "S4 邀請參觀 - 隔間工程需求", category: "辦公室出租", content: "我們提供的是『即租即用』的標準配置，能讓您省下大筆裝潢費。\n若有特殊隔間或插座需求，您可以選擇自行委託廠商（退租時恢復原狀即可），或由我們配合的特約工程團隊代為施工。使用特約團隊的優點是：他們對本中心管線與消防法規非常熟悉，能省去您找工班與溝通的麻煩，確保合規且高效。\n\n您希望針對哪個位置做調整？我可以請工程部先幫您初步評估可行性。" },
  { label: "S5 正式報價 - 報價單確認", category: "辦公室出租", content: "您好，感謝您先前的溝通與確認。附件為您準備的正式書面報價單，內容已包含稅金、管理費及等其他各項商務配套。\n\n針對我們先前討論的客製化需求（如：[填入需求項目]），我已將其一併納入此份報價說明中。此方案與保留間別的有效期限至 [日期]，建議您先行參閱以確保您的入駐權益。\n\n若報價內容確認無誤，我們即可對租期或搬遷時程做最終確認。如有任何需要調整的地方，歡迎隨時告訴我！" },
  { label: "S6 議價協商 - 事業夥伴價值", category: "辦公室出租", content: "您好，針對您的預算考量，我們更希望透過『共好』模式支持您的事業。除了租金外，入駐我們這裡您將獲得：\n\n管理提效：提供標準化內部管理系統.\n商務資源：享有專屬的輕分享與社群活動。\n\n專業後援：秘書團隊作為您的企業門面接待訪客，並提供靈活的空間擴張彈性，降低營運風險。\n\n我們不只是租賃空間，更是您的事業夥伴。若您認同這份價值，我將為您申請最優化的 [租期/年繳] 方案，讓我們一起在這裡成長！" },
  { label: "S6 議價協商 - 會議室時數爭取", category: "辦公室出租", content: "若預算上有特定考量，除了租金外，我也能試試為您爭取每月額外的 [小時] 小時會議室使用時數，或是郵件代收發的加值服務。這對經常有訪客接待需求的團隊來說非常實用。您覺得這樣是否能讓整體方案與需求相符？" },
  { label: "S7 簽約確認 - 入駐條件總結", category: "辦公室出租", content: "您好，感謝您對我們的喜愛！為確保入駐流程精準無誤，我已將我們先前達成的共識整理如下，請您協助確認：\n\n【入駐條件總結】\n合約期間：[起始日] 至 [結束日]，共計 [月數] 個月。\n空間費用：月租金 $[金額]（含稅/含管），本次需支付 [押金月數] 個月押金與首月租金。\n繳費方式：採 [年繳 / 季繳 / 月繳] 方式。\n特殊約定：包含之前確認的 [例如：免租裝修期天數、贈送會議室時數、特定硬體改裝等]。" },
  { label: "S7 簽約確認 - 基本資料蒐集", category: "辦公室出租", content: "手打資訊回覆\n公司名稱：\n負責人姓名：\n統一編號（若未取得可留空）：\n聯繫地址：\n聯繫電話：\n授權代表或緊急聯絡人：\n緊急聯絡人電話：\n請款單寄送 Email 信箱：\n👉 並提供: 負責人身分證正反面拍照、營登\n1️⃣ 公司大小章\n2️⃣ 費用 匯款/現金\n「我們的行政與秘書群，將全程協助您順利完成登記與進場。」" },
  { label: "S7 簽約確認 - 合約保留通知", category: "辦公室出租", content: "合約已寄至您的信箱，請於 3 日內確認內容並完成訂金匯款，以利為您保留該空間位子。" },
  { label: "S7 簽約確認 - 歡迎入駐引導", category: "辦公室出租", content: "親愛的___________您好，\n📌簽立合約: 線上/現場\n📌租金與押金:匯款/現金\n📌安排進場與設備交接\n付款完成後，我們將協助安排進場時間，並說明門禁、空間使用方式與設備操作。 若有任何特殊需求（如公司報帳流程、進場時間、客製家具等），我們將盡力協助。\n歡迎你們 ~~" },
  { label: "S8 資訊入系統 - 入駐懶人包", category: "辦公室出租", content: "歡迎入駐！這是您的入駐懶人包與相關系統設定。\n在道騰，登記只是開始，想盡辦法幫助您們成功，才是我們真正的服務。\n以下是《道騰國際商務中心 顧客成功問卷》 https://reurl.cc/lYGlq6\n邀請您們團隊的每位同仁填寫。\n歡迎來到道騰，有你們真好!!\n\n全區 Wi-Fi\n帳號：Dao Teng 21F A區/B區（或 20F/27F/28F）\n密碼：1234567890\n現磨咖啡：每杯 30 元，收益全數捐贈慈善機構。\n空調提醒：20F/21F 為中央空調，非上班時間預設送風模式。\n\n我們非常樂意協助舉辦活動，一起同樂！有想法隨時分享～\nWish you a wonderful office life." },
  { 
    label: "S1 初步諮詢 -新設立|變更登記|遷移地址流程", 
    category: "工商登記", 
    content: `您好, 感謝 {username} 的來訊！😊

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
    label: "S2 新手小白 A", 
    category: "工商登記", 
    content: `Hello, {username}
沒問題，創業初期流程真的比較繁瑣，別擔心，我們來幫您化繁為簡！💪

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
    label: "S2 B老手創業 ", 
    category: "工商登記", 
    content: `Hello, {username}

了解！既然您已經熟悉流程，那我們就講求**「效率」與「合規」**。

道騰國際DT Space Team的優勢在於： 
✅ 穩定性： 專業＆超過10年的品牌經營
✅ 服務團隊支援： 線上＆線下專業秘書服務團隊，高效率處理好您的各項行政＆雜事需求 (代收政府公文與包裹，並拍照通知，絕不漏信) 
✅ 稅務應對： 經驗豐富的現場人員，協助應對國稅局實地查核
✅ 數位應用：數位AI應用提升客戶體驗＆服務效率
✅ 生態系：豐富高雄在地生態資源＆鏈結超過1000+在地產業

請問您預計大約何時需要完成遷移呢？
您可以直接告訴我您的情況，讓我為您安排最適合的方案！ 
自動化預算計算器：https://www.daoteng.org/virtue-office-calc 
快速了解初步方案＆內容

🏬地址變更
📹 影片說明:https://reurl.cc/9by65d
創業導航 
變更登記說明:https://reurl.cc/lab6qd
讓道騰協助貴公司快速完成地址遷移`
  },
  { 
    label: "S3 報價建議 - 報價計算器", 
    category: "工商登記", 
    content: `親愛的 {username} 您好！

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
影片說明:  https://reurl.cc/W80Wre`
  },
  { 
    label: "S4 追蹤關懷 - 報價後3天內", 
    category: "工商登記", 
    content: `{username}您好！

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
    label: "S5-A 簽約準備 - 民權｜準備文件 合約", 
    category: "工商登記", 
    content: `{username}太好了！歡迎加入道騰的大家庭 🤝

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
    label: "S5 簽約準備 -B 四維館準備文件", 
    category: "工商登記", 
    content: `{username}太好了！歡迎加入道騰的大家庭 🤝

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
(*)道騰四維亞灣館 Tel：(07) 536-8880 #9
(*)地址：高雄市苓雅區四維四路 199 號 12 樓
(*) Google 導覽：https://reurl.cc/VXgvQR
(*)停車資訊：https://www.daoteng.org/leek

 五、欲了解完整的公司設立流程，可參考此教學文章說明：
🔗 https://reurl.cc/4megzY

【備註】
如有其他問題（如政府查驗、會計師代辦、報稅開戶流程等），我們也能提供配套資訊與專業協助。
以上資料完備簽約僅需約 15 分鐘。`
  },
  { 
    label: "S6 簽約完成感謝", 
    category: "工商登記", 
    content: `感謝 {username} 今天撥空前來簽約，合作愉快！🎊 很開心有為您服務的機會

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
];

// 自動調整高度的 Textarea 組件
function AutoResizeTextarea({ value: initialValue, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(initialValue);

  // 當 Firebase 的原始資料改變時（例如其他裝置修改），更新本地顯示值
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // 自動調整高度邏輯
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localValue]);

  // 處理輸入，避免游標跳動
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal); // 先更新本地畫面，保持游標位置穩定
    onChange(newVal);      // 同步回報給父組件以更新資料庫
  };

  return (
    <textarea
      ref={textareaRef}
      className="w-full text-sm leading-relaxed bg-slate-50 border border-slate-100 rounded-2xl p-6 outline-none focus:ring-4 focus:ring-purple-500/5 transition-all text-slate-700 font-medium overflow-hidden resize-none"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      rows={1}
    />
  );
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("全部");

  useEffect(() => {
    // 💡 修正：依照 updatedAt 排序，確保最新寫完的在最上面，並且監聽即時更新
    const q = query(collection(db, "copyTemplates"), orderBy("label", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } else {
        setTemplates(INITIAL_TEMPLATES.map((t, i) => ({ ...t, id: `init-${i}`, order: i })));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleUpdate = async (id: string, field: string, value: string) => {
    if (!id || id.startsWith('init-')) return;
    try {
      const docRef = doc(db, "copyTemplates", id);
      await updateDoc(docRef, { [field]: value, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error("更新失敗:", e);
    }
  };

  const handleAddNew = async () => {
    try {
      const newLabel = prompt("請輸入新範本標題：", "新範本標題");
      if (!newLabel) return;
      
      const category = filterCategory === "全部" ? "辦公室出租" : filterCategory;
      
      // 💡 修正：確保寫入時帶有正確的 updatedAt，系統才會立刻偵測並儲存顯示
      await addDoc(collection(db, "copyTemplates"), {
        label: newLabel,
        category: category,
        content: "請在此輸入內容...",
        order: templates.length,
        updatedAt: serverTimestamp()
      });
      
      alert("✅ 已新增空白範本，內容會自動即時儲存。");
    } catch (e) {
      console.error("新增失敗:", e);
      alert("新增失敗");
    }
  };

  const filteredTemplates = templates.filter(t => 
    filterCategory === "全部" || t.category === filterCategory
  );

  if (loading) return <div className="p-20 text-center font-bold text-slate-400 text-slate-800">正在載入管理介面...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <button onClick={() => window.location.href = '/cases'} className="text-slate-400 hover:text-slate-600 transition-colors">←</button>
               <h1 className="text-2xl font-black text-slate-800">📋 範本快速編輯後台</h1>
            </div>
            <p className="text-slate-400 text-sm">此處修改後將即時同步至各業務「內容複製」選單。</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button
                onClick={handleAddNew}
                className="text-[10px] font-black px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all"
            >
                ➕ 新增範本
            </button>
                

            <div className="flex gap-2">
              {["全部", "辦公室出租", "工商登記", "活動管理"].map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setFilterCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    filterCategory === cat ? "bg-slate-900 text-white" : "bg-white text-slate-400 border border-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="space-y-6">
          {filteredTemplates.map((item, idx) => (
            <div key={item.id} className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-1 rounded">#{idx + 1}</span>
                  <input 
                    className="font-black text-purple-600 text-lg border-b border-transparent focus:border-purple-200 outline-none w-[450px] bg-transparent"
                    value={item.label}
                    onChange={(e) => handleUpdate(item.id, "label", e.target.value)}
                  />
                </div>
                <div className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 cursor-default select-none">
                  {item.category === "辦公室出租" && "🏢 辦公室出租"}
                  {item.category === "工商登記" && "⚖️ 工商登記"}
                  {item.category === "活動管理" && "🎉 活動管理"}
                </div>
              </div>

              <AutoResizeTextarea 
                value={item.content}
                onChange={(val) => handleUpdate(item.id, "content", val)}
                placeholder="請輸入範本內容..."
              />
              
              <div className="flex justify-between items-center text-[9px] text-slate-300 font-bold tracking-wider px-2">
                <span>UPDATED: {item.updatedAt?.toDate().toLocaleString() || "SYNCING..."}</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  雲端即時同步中
                </span>
              </div>
            </div>
          ))}
          {filteredTemplates.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400 font-bold italic">
              此分類尚無範本內容
            </div>
          )}
        </div>
      </div>
    </div>
  );
}