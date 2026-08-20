// ============================================================
// ゲームデータ(店員・客・案件・トラブル・セリフ)
// ============================================================

// ---------- 名前 ----------
export const FAMILY_NAMES = [
  '佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤',
  '吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水',
  '山崎','阿部','森','池田','橋本','石川','前田','藤田','後藤','岡田',
  '長谷川','村上','近藤','石井','坂本','遠藤','青木','藤井','西村','福田',
];
export const GIVEN_NAMES = [
  '翔太','美咲','健一','由紀','大樹','彩','拓也','千尋','悠斗','恵',
  '直樹','麻衣','涼','さくら','蓮','葵','陸','結衣','颯太','美穂',
  '亮介','里奈','和也','智子','隼人','杏','海斗','詩織','大輔','菜々',
];

// ---------- 店員タイプ ----------
// resilience : ストレス段階の閾値をずらす(高いほど粘る)
// panic      : 高ストレス時にパニックを起こす確率
// conflict   : 高ストレス時に客と衝突する確率
// push       : 混雑時でも追加提案を続ける度合い(接客が延びる)
// breakdown  : 限界時の影響の大きさ(平穏度ダメージ・離脱時間)
export const STAFF_TYPES = [
  {
    id: 'rookie', name: '新人', color: 0x6fb3e0,
    desc: '処理速度が遅くミスが多い。難案件でパニックになりやすい。',
    speed: 0.62, skill: 0.50, mistake: 0.22, stressGain: 1.55, satisfy: 0.90, salesMul: 0.7,
    resilience: -8, panic: 0.55, conflict: 0.05, push: 0, breakdown: 0.9,
  },
  {
    id: 'veteran', name: 'ベテラン', color: 0x3f7f6f,
    desc: '処理速度が速く難案件にも強い。ただし一度限界を迎えると影響が大きい。',
    speed: 1.35, skill: 1.00, mistake: 0.05, stressGain: 0.70, satisfy: 1.05, salesMul: 1.0,
    resilience: 12, panic: 0.05, conflict: 0.12, push: 0, breakdown: 1.9,
  },
  {
    id: 'polite', name: '超丁寧', color: 0xc98fb8,
    desc: '客の満足度が上がりやすいが、接客時間が長い。',
    speed: 0.72, skill: 0.88, mistake: 0.06, stressGain: 0.95, satisfy: 1.45, salesMul: 0.95,
    resilience: 4, panic: 0.15, conflict: 0.04, push: 0.15, breakdown: 1.1,
  },
  {
    id: 'sales', name: '売上至上主義', color: 0xe0a43f,
    desc: '契約率が高い。混雑していても追加提案を続けて接客が長引く。',
    speed: 1.05, skill: 0.82, mistake: 0.10, stressGain: 0.85, satisfy: 0.72, salesMul: 2.0,
    resilience: 6, panic: 0.1, conflict: 0.18, push: 1.0, breakdown: 1.2,
  },
  {
    id: 'avoider', name: '面倒事回避型', color: 0x8a9bb0,
    desc: '簡単な案件は高速。難しい案件でストレスが急上昇し、席を外したがる。',
    speed: 1.10, skill: 0.75, mistake: 0.12, stressGain: 1.15, satisfy: 0.88, salesMul: 0.85,
    resilience: -2, panic: 0.2, conflict: 0.08, push: 0, breakdown: 0.8, escape: 1.0,
  },
  {
    id: 'shorttemper', name: '短気', color: 0xd0705f,
    desc: '能力は高いが、ストレスが溜まると客と衝突する。',
    speed: 1.25, skill: 0.95, mistake: 0.09, stressGain: 1.30, satisfy: 0.85, salesMul: 1.05,
    resilience: 0, panic: 0.1, conflict: 1.0, push: 0.1, breakdown: 1.3,
  },
];

// ---------- 年齢層 ----------
export const AGE_GROUPS = [
  { label: '10代', weight: 8 },
  { label: '20代', weight: 16 },
  { label: '30代', weight: 16 },
  { label: '40代', weight: 16 },
  { label: '50代', weight: 15 },
  { label: '60代', weight: 15 },
  { label: '70代以上', weight: 14 },
];

// ---------- 来店目的 ----------
// diff: 案件難易度(1-5) / sales: 売上レンジ
export const PURPOSES = [
  { name: '機種変更', diff: 3, sales: [58000, 148000], lines: ['そろそろ機種変更したいんですけど', '新しいの、安いのないですか'] },
  { name: '新規契約', diff: 3, sales: [38000, 120000], lines: ['新規で契約したくて来ました', '子どもに持たせる用なんですけど'] },
  { name: 'MNP', diff: 4, sales: [52000, 155000], lines: ['他社から乗り換えたいです', 'MNPってやつ、お願いします'] },
  { name: '料金相談', diff: 2, sales: [0, 9000], lines: ['最近、料金が高い気がして', 'このプラン、えっと、合ってます？'] },
  { name: '故障相談', diff: 4, sales: [0, 32000], lines: ['画面が急につかなくなって', '落としたら変な線が出るんです'] },
  { name: 'SIM交換', diff: 2, sales: [3300, 13000], lines: ['SIMを交換したいんですが', 'SIMが認識しないみたいで'] },
  { name: 'データ移行', diff: 4, sales: [0, 12000], lines: ['データを移してほしいんです', '前のスマホから全部移りますか？'] },
  { name: '操作説明', diff: 2, sales: [0, 3500], lines: ['使い方が分からなくて', 'ちょっと教えてほしいだけなんです'] },
  { name: 'Apple ID相談', diff: 5, sales: [0, 3000], lines: ['アップルのやつが開けなくて', 'Apple IDが分からないんです'] },
  { name: 'Googleアカウント相談', diff: 5, sales: [0, 3000], lines: ['グーグルにログインできなくて', 'アカウントって何個もあるんですか？'] },
  { name: 'LINE移行', diff: 4, sales: [0, 3500], lines: ['LINEを移してください', 'トーク、全部残りますよね？'] },
  { name: 'Wi-Fi相談', diff: 2, sales: [0, 2000], lines: ['家のWi-Fiが繋がらなくて', 'Wi-Fiって何ですか？'] },
  { name: '「なんかスマホがおかしい」', diff: 3, sales: [0, 2500], lines: ['なんかスマホがおかしいんです', '説明できないけど、変なんです'] },
  { name: 'とりあえず話を聞きたい', diff: 1, sales: [0, 6000], lines: ['とりあえず話だけ聞きたくて', '今日は決めないつもりなんですけど'] },
];

// ---------- 客の性格 ----------
// patience: 忍耐倍率 / angerMul: 怒り上昇倍率 / diffAdd: 難易度加算 / stressMul: 店員ストレス倍率
export const TRAITS = [
  { name: '温厚', patience: 1.45, angerMul: 0.6, diffAdd: 0, stressMul: 0.8, satisfy: 1.15 },
  { name: '短気', patience: 0.62, angerMul: 1.7, diffAdd: 0, stressMul: 1.25, satisfy: 0.85 },
  { name: 'せっかち', patience: 0.7, angerMul: 1.45, diffAdd: 0, stressMul: 1.15, satisfy: 0.9 },
  { name: '優柔不断', patience: 1.1, angerMul: 0.9, diffAdd: 1, stressMul: 1.2, satisfy: 1.0, timeMul: 1.35 },
  { name: '機械が苦手', patience: 1.15, angerMul: 0.9, diffAdd: 1, stressMul: 1.15, satisfy: 1.0, timeMul: 1.3 },
  { name: '話を聞かない', patience: 0.95, angerMul: 1.25, diffAdd: 1, stressMul: 1.4, satisfy: 0.8, timeMul: 1.2 },
  { name: '店員を疑う', patience: 0.9, angerMul: 1.3, diffAdd: 0, stressMul: 1.45, satisfy: 0.75 },
  { name: '値引き交渉が激しい', patience: 1.0, angerMul: 1.2, diffAdd: 1, stressMul: 1.5, satisfy: 0.8, timeMul: 1.25 },
  { name: '家族任せ', patience: 1.2, angerMul: 0.85, diffAdd: 1, stressMul: 1.2, satisfy: 1.0, timeMul: 1.2 },
  { name: '世間話が長い', patience: 1.35, angerMul: 0.7, diffAdd: 0, stressMul: 1.1, satisfy: 1.1, timeMul: 1.5 },
  { name: 'パスワードを覚えていない', patience: 1.0, angerMul: 1.0, diffAdd: 2, stressMul: 1.5, satisfy: 0.95, timeMul: 1.4 },
  { name: '前の店員と比較する', patience: 0.9, angerMul: 1.25, diffAdd: 0, stressMul: 1.6, satisfy: 0.75 },
  { name: 'スマホに非常に詳しい', patience: 1.1, angerMul: 0.9, diffAdd: -1, stressMul: 1.15, satisfy: 1.0, timeMul: 0.8 },
  { name: '店員より詳しい', patience: 1.0, angerMul: 1.1, diffAdd: -1, stressMul: 1.7, satisfy: 0.9, timeMul: 0.9 },
  { name: '思い込みが激しい', patience: 0.95, angerMul: 1.3, diffAdd: 1, stressMul: 1.45, satisfy: 0.8, timeMul: 1.2 },
];

// ---------- 店員の相槌 ----------
export const STAFF_REPLIES = [
  'かしこまりました', '少々お待ちください', 'ご案内いたしますね', '確認いたします',
  'なるほど……', 'そうなんですね', '承知いたしました', 'こちらで対応できます',
  'はい、大丈夫ですよ', 'お調べしますね',
];
export const STAFF_STRAINED = [
  '……', 'えーっと……', '（笑顔）', 'ご、ご説明しますね', 'それは……ですね',
  'すこし、お時間いただきます', '……はい', '（バックヤードを見る）',
];

// ---------- 世間話 ----------
export const SMALL_TALK = [
  '孫がね、動画ばっかり見るのよ',
  '前のスマホは10年使ってたんです',
  'この店、駐車場が分かりにくいね',
  '雨、降りそうですねえ',
  '娘が「聞いてこい」って言うもんで',
  '写真、消えたら困るんです',
  '猫の写真が3万枚あります',
  '電池、すぐ減るんですよ',
  '前はもっと安かった気がして',
  'とりあえず、いちばん良いやつで',
];

// ---------- 通常トラブルイベント ----------
// stress: 店員ストレス / anger: 客の怒り / time: 接客時間延長(秒)
export const TROUBLES = [
  {
    id: 'appleid', name: 'Apple ID不明', weight: 10, stress: 14, anger: 6, time: 9,
    beats: [{ w: 'c', t: 'Apple IDって何ですか？' }, { w: 's', t: 'ご登録のメールアドレスなのですが……' }, { w: 'c', t: 'メール？使ってないです' }],
  },
  {
    id: 'password', name: 'パスワード不明', weight: 10, stress: 12, anger: 5, time: 8,
    beats: [{ w: 'c', t: 'パスワード、全部分かりません' }, { w: 's', t: '……全部、ですか' }],
  },
  {
    id: 'noid', name: '本人確認書類なし', weight: 8, stress: 13, anger: 10, time: 6,
    beats: [{ w: 'c', t: '免許証もマイナンバーカードもないです' }, { w: 's', t: '恐れ入ります、本人確認が必要でして' }, { w: 'c', t: '顔で分かるでしょ' }],
  },
  {
    id: 'absent', name: '契約者本人不在', weight: 7, stress: 12, anger: 9, time: 5,
    beats: [{ w: 'c', t: '契約は夫の名義です。夫は家にいます' }, { w: 's', t: 'ご本人様の確認が必要になりまして……' }],
  },
  {
    id: 'moveall', name: 'データ全部移して', weight: 9, stress: 16, anger: 4, time: 12,
    beats: [{ w: 'c', t: '写真もLINEもゲームも銀行アプリも全部移して' }, { w: 's', t: '一部はお客様の操作が必要でして……' }, { w: 'c', t: 'やり方分かんないです' }],
  },
  {
    id: 'prevshop', name: '前の店ではやってくれた', weight: 9, stress: 18, anger: 8, time: 5,
    beats: [{ w: 'c', t: '前の店では無料でやってくれたよ' }, { w: 's', t: '……申し訳ありません' }],
  },
  {
    id: 'yesterday', name: '昨日まで使えてた', weight: 8, stress: 10, anger: 7, time: 7,
    beats: [{ w: 'c', t: '昨日までは普通に使えてたんです' }, { w: 's', t: '何か操作をされましたか？' }, { w: 'c', t: '何もしてないです' }],
  },
  {
    id: 'nocharge', name: '充電されない', weight: 8, stress: 7, anger: 4, time: 5, twist: '原因はケーブルの断線でした',
    beats: [{ w: 'c', t: '充電できないんです、故障ですよね' }, { w: 's', t: 'ケーブルを拝見しますね' }, { w: 's', t: '……こちら、断線しています' }],
  },
  {
    id: 'wifi', name: 'Wi-Fiが壊れた', weight: 8, stress: 6, anger: 3, time: 4, twist: '原因は機内モードでした',
    beats: [{ w: 'c', t: 'Wi-Fiが壊れました' }, { w: 's', t: '……機内モードがオンになっています' }, { w: 'c', t: 'それ触ってないです' }],
  },
  {
    id: 'slow', name: 'スマホが遅い', weight: 8, stress: 9, anger: 3, time: 6, twist: 'タブが312個開いていました',
    beats: [{ w: 'c', t: 'スマホがとにかく遅いんです' }, { w: 's', t: 'ブラウザのタブが……312個開いていますね' }, { w: 'c', t: 'それ何ですか' }],
  },
  {
    id: 'storage', name: '容量不足', weight: 9, stress: 11, anger: 5, time: 8,
    beats: [{ w: 'c', t: '写真が保存できないんです' }, { w: 's', t: '空き容量が0.02GBですね……' }, { w: 'c', t: '1枚も消したくないです' }],
  },
  {
    id: 'family', name: '家族乱入', weight: 6, stress: 15, anger: 6, time: 9,
    beats: [{ w: 'c', t: '（電話）……えっ、やっぱりiPhoneがいいって' }, { w: 's', t: 'で、では最初から……' }],
  },
  {
    id: 'discount', name: '値引き要求', weight: 7, stress: 14, anger: 7, time: 6,
    beats: [{ w: 'c', t: 'もうちょっと安くなりませんか' }, { w: 's', t: '規定の価格でして……' }, { w: 'c', t: '他の店なら安くしてくれる' }],
  },
  {
    id: 'option', name: 'オプション提案が刺さる', weight: 7, stress: 6, anger: 12, time: 4, salesBonus: 1.35,
    beats: [{ w: 's', t: 'こちらの補償オプションもいかがですか' }, { w: 'c', t: 'いらないって言いましたよね' }],
  },
  {
    id: 'longtalk', name: '世間話が終わらない', weight: 7, stress: 8, anger: -3, time: 10,
    beats: [{ w: 'c', t: 'それでね、孫がね……' }, { w: 's', t: 'は、はい……' }, { w: 'c', t: 'それでね、去年の話なんだけど' }],
  },
];

// ---------- レア(特殊)案件 ----------
export const RARE_CASES = [
  { name: 'スマホが俺を監視している', diff: 5, stress: 26, time: 14,
    beats: [{ w: 'c', t: 'このスマホ、俺を監視してますよね' }, { w: 's', t: 'そ、そのような機能は……' }, { w: 'c', t: '証拠はここにあります' }] },
  { name: '電波が頭に刺さる', diff: 5, stress: 24, time: 13,
    beats: [{ w: 'c', t: '電波が頭に刺さるんです' }, { w: 's', t: '……病院に相談されては' }, { w: 'c', t: '病院は電波が強いんです' }] },
  { name: 'このスマホ、昨日しゃべった', diff: 4, stress: 20, time: 11,
    beats: [{ w: 'c', t: 'このスマホ、昨日しゃべったんです' }, { w: 's', t: '音声アシスタントかと……' }, { w: 'c', t: '違います。名前を呼ばれました' }] },
  { name: '全部無料にして', diff: 5, stress: 28, time: 12,
    beats: [{ w: 'c', t: '全部無料にしてください' }, { w: 's', t: 'それは、ちょっと……' }, { w: 'c', t: 'できるはずです' }] },
  { name: '社長を呼んで', diff: 5, stress: 30, time: 10, complaint: true,
    beats: [{ w: 'c', t: '社長を呼んでください' }, { w: 's', t: '当店には店長までしか……' }, { w: 'c', t: 'じゃあ本社に電話します' }] },
  { name: 'Googleを消して', diff: 5, stress: 22, time: 12,
    beats: [{ w: 'c', t: 'このGoogleっての、消してください' }, { w: 's', t: '消すとほぼ何もできなくなります' }, { w: 'c', t: '構いません' }] },
  { name: 'インターネットを解約したい', diff: 5, stress: 21, time: 12,
    beats: [{ w: 'c', t: 'インターネットを解約したいです' }, { w: 's', t: 'ご契約の回線を、ですか？' }, { w: 'c', t: 'いえ、インターネットそのものを' }] },
  { name: 'LINEだけ残してスマホを解約', diff: 5, stress: 23, time: 12,
    beats: [{ w: 'c', t: 'LINEだけ残してスマホを解約したいです' }, { w: 's', t: '……回線が無いとLINEも使えません' }, { w: 'c', t: 'そこを何とか' }] },
  { name: '虫が画面の中にいる', diff: 4, stress: 18, time: 10,
    beats: [{ w: 'c', t: '画面の中に虫がいるんです' }, { w: 's', t: '……ドット抜けかもしれません' }, { w: 'c', t: '動いてます。今も' }] },
  { name: '前世から使っている番号', diff: 5, stress: 25, time: 13,
    beats: [{ w: 'c', t: 'この番号、前世から使ってるので変えられません' }, { w: 's', t: '番号はそのままご利用いただけます' }, { w: 'c', t: '前世の分の料金は？' }] },
];

// ---------- 怒りセリフ ----------
export const ANGRY_LINES = [
  'まだですか', 'どれだけ待たせるんですか', '何分待たせるの', 'もういい、帰ります',
  '呼ばれてないんですけど', '順番おかしくないですか', '予約したのに', '責任者を出して',
];
export const LEAVE_LINES = ['……もういいです', '二度と来ません', '他の店に行きます', '時間の無駄でした'];
export const HAPPY_LINES = ['ありがとう、助かりました', '丁寧に説明してくれて助かった', 'また来ますね', 'すっきりしました'];

// ---------- 店員のメンタル系セリフ ----------
export const BREAK_LINES = ['ちょっとバックヤード行ってきます', '在庫、確認してきます', '……少し外します'];
export const MELTDOWN_LINES = ['ちょっとバックヤード行ってきます……', 'すみません、限界です', '……ちょっと、無理かもしれません'];
export const QUIT_LINES = ['もう無理です', '辞めます。今日で辞めます', 'お先に失礼します。永遠に'];
export const CONFLICT_LINES = ['だから、さっきから言ってますよね？', 'それは無理だと申し上げました', '……こちらの話も聞いてください'];

// ============================================================
// 追加データ(崩壊連鎖アップデート)
// ============================================================

// ---------- ストレス段階ごとの店員のセリフ ----------
// 中ストレス:少し疲れる / 高ストレス:無言・バックヤードを見る / 限界:破綻
export const STAFF_TIRED = [
  'えー、はい、はい', 'ちょっと確認しますね……', 'もう少しだけお時間を',
  'そうですね……はい', '（時計を見る）', 'えーっと、どこまででしたっけ',
];
export const STAFF_SILENT = [
  '……', '（無言）', '（バックヤードを見る）', '（画面をじっと見ている）',
  '（手が止まっている）', '……はい', '（返事が遅れる）',
];
export const STAFF_PANIC = [
  'あっ、すみません、あの、えっと', '先輩、これ、これって……',
  '……ちょっと待ってください、待ってください', 'あれ、あれ、消えた',
  'すみません、もう一回、最初から……',
];
export const STAFF_LIMIT = [
  '……もう、無理です', '……ちょっと、すみません', '（席を立った）',
  '……（何も言わずに立ち上がった）',
];
export const CLAIM_LINES = [
  '大変申し訳ございません', 'お待たせして申し訳ありません',
  '事情をお伺いします', '責任者として対応いたします', 'ご不快な思いをさせてしまい……',
];
export const REFUSE_LINES = [
  '……すみません、今は',
  '（新しいお客様の方を見ない）',
  '……少しだけ、お時間ください',
];

// ---------- 客の相互作用セリフ ----------
export const ENVY_LINES = [
  'あっちは楽しそうだね', 'こっちは何分待ってると思ってるの',
  '順番、飛ばされてない？', 'あの人、後から来たよね？',
];
export const CROWD_LINES = [
  'うわ、混んでる……', 'これ、何分待ちですか？', '今日は無理かな',
  '整理券、まだ動いてないよ',
];
export const CONTAGION_LINES = [
  '……なんか、揉めてるね', 'この店、大丈夫？', '帰ろうかな',
  '（さっきの怒鳴り声が気になる）',
];

// ============================================================
// 特殊イベント(店舗全体を揺らす)
// ============================================================
// risk : 店が混んでいるほど危険度が上がる。空いていれば処理できる
// kind : sim 側の処理分岐
export const SPECIAL_EVENTS = [
  {
    id: 'family5', name: '家族5人まとめて機種変更', kind: 'group',
    count: 5, purpose: '機種変更', diffAdd: 1, weight: 10,
    line: '家族5人、まとめて機種変更でお願いします',
    calm: '5人まとめての機種変更。今なら、なんとか捌けそうです',
    busy: '5人まとめての機種変更。この混雑では致命傷になりかねません',
  },
  {
    id: 'allappleid', name: 'Apple IDが全員不明', kind: 'infect',
    troubleId: 'appleid', weight: 9,
    line: 'Apple IDが分からないんです',
    calm: '接客中の全員がApple IDを覚えていません',
    busy: '接客中の全員がApple IDを覚えていません。全カウンターが止まりました',
  },
  {
    id: 'lastmnp', name: '閉店10分前にMNP', kind: 'single',
    purpose: 'MNP', diffAdd: 2, patienceMul: 0.75, weight: 8, lateOnly: true,
    line: '閉店まであと少しですけど、MNPお願いします',
    calm: 'この時間にMNP。長期戦になります',
    busy: 'この時間にMNP。もう誰も手が空いていません',
  },
  {
    id: 'allplans', name: '料金相談のはずが家族全回線見直し', kind: 'escalate',
    purpose: '料金相談', diffAdd: 3, timeMul: 2.0, weight: 10,
    line: 'ついでに家族全員分の回線も見てもらえます？',
    calm: '料金相談が家族全回線の見直しに発展しました',
    busy: '料金相談が家族全回線の見直しに発展。カウンターが1つ潰れました',
  },
  {
    id: 'differentstory', name: '前の店員に聞いた話と違う', kind: 'claimNow',
    weight: 9,
    line: '前の店員さんに聞いた話と全然違うんですけど',
    calm: '説明の食い違いが発覚しました',
    busy: '説明の食い違いが発覚。クレームに発展しました',
  },
  {
    id: 'brokenrush', name: '予約なし故障相談が連続来店', kind: 'group',
    count: 3, purpose: '故障相談', diffAdd: 1, weight: 10,
    line: '予約してないんですけど、壊れちゃって',
    calm: '飛び込みの故障相談が3件。今なら順番に見られます',
    busy: '飛び込みの故障相談が3件。待合が限界です',
  },
  {
    id: 'expertvsrookie', name: 'スマホに詳しい客 vs 新人', kind: 'single',
    purpose: '「なんかスマホがおかしい」', traitName: '店員より詳しい', diffAdd: 1, weight: 9,
    line: 'その説明、たぶん間違ってますよ',
    calm: '詳しいお客様が来店。担当次第では長引きます',
    busy: '詳しいお客様が来店。新人しか手が空いていません',
  },
  {
    id: 'foundmistake', name: '店員より詳しい客が説明ミスを発見', kind: 'catchMistake',
    weight: 8,
    line: '今の説明、公式サイトと違いますよね？',
    calm: '説明ミスを指摘されました',
    busy: '説明ミスを指摘され、周囲の客もざわつき始めました',
  },
  {
    id: 'sysdown', name: '契約システムが重い', kind: 'systemSlow',
    weight: 8,
    line: '（画面が固まっている）',
    calm: 'システムが重くなっています。今は影響は小さそうです',
    busy: 'システムが重くなりました。全カウンターの処理が遅延します',
  },
  {
    id: 'phonerush', name: '電話が鳴り止まない', kind: 'phone',
    weight: 8,
    line: '（受話器を取る）',
    calm: '電話が鳴り続けています。手が空いている店員が対応しました',
    busy: '電話が鳴り止まず、店員が1人取られました',
  },
];

// ============================================================
// 崩壊タイトル生成用のフレーズ
// ============================================================
export const WEEKDAYS = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];

export const TITLE_FALLBACK = [
  '静かに壊れた{weekday}',
  'いつも通りの{weekday}、のはずだった',
  '誰も悪くない{weekday}',
  '今日はもう閉めましょう',
  '平常運転が限界だった日',
  'そして誰も並ばなくなった',
];
