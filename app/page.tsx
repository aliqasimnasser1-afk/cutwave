import Link from "next/link";
import {
  BadgeCheck,
  Download,
  HardDrive,
  Lock,
  Minimize2,
  Music2,
  Scissors,
  SlidersHorizontal,
  UploadCloud,
  WifiOff,
  Zap,
} from "lucide-react";
import Background from "@/components/Background";
import Cutter from "@/components/Cutter";
import InstallButton from "@/components/InstallButton";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const steps = [
  {
    icon: UploadCloud,
    title: "اختر الملف",
    text: "اسحبه إلى الصفحة أو اختره من جهازك.",
  },
  {
    icon: SlidersHorizontal,
    title: "حدد المقطع",
    text: "حرّك المقبضين أو اكتب الوقت بدقة.",
  },
  {
    icon: Download,
    title: "صدّر ونزّل",
    text: "يُحفظ المقطع مباشرة على جهازك.",
  },
];

const features = [
  {
    icon: Lock,
    title: "ملفاتك لا تغادر جهازك",
    text: "المعالجة كلها داخل المتصفح. لا رفع ولا خوادم.",
  },
  {
    icon: Minimize2,
    title: "ضغط لحجم محدد",
    text: "اختر 16 MB لواتساب أو 10 MB لديسكورد، ويضبط Cutwave الجودة تلقائياً.",
  },
  {
    icon: Zap,
    title: "تسريع بالعتاد",
    text: "يستخدم WebCodecs ومعالج الرسوميات، أو كل أنوية المعالج عند الحاجة.",
  },
  {
    icon: HardDrive,
    title: "ملفات ضخمة",
    text: "يقرأ الملف من القرص مباشرة، فلا يُحمَّل كاملاً في الذاكرة.",
  },
  {
    icon: WifiOff,
    title: "تطبيق يعمل بدون إنترنت",
    text: "ثبّته على الجوال أو الكمبيوتر، ويعمل حتى بلا اتصال.",
  },
  {
    icon: Music2,
    title: "استخراج الصوت ومشاركته",
    text: "حوّل أي جزء إلى MP3، وشارك الناتج مباشرة من الجوال.",
  },
];

const faqs = [
  {
    q: "هل يتم رفع ملفاتي إلى أي مكان؟",
    a: "لا. Cutwave يعمل بالكامل داخل متصفحك، ولا يغادر الملف جهازك أبداً.",
  },
  {
    q: "ما أقصى حجم للملف؟",
    a: "الملف الأصلي يُقرأ من القرص مباشرة، فيمكن فتح ملفات بعدة غيغابايت. الحد هو حجم المقطع الناتج: حوالي 1.5 GB، لأنه يُبنى داخل ذاكرة المتصفح.",
  },
  {
    q: "ما الفرق بين السريع والدقيق؟",
    a: "السريع ينسخ البيانات بدون إعادة ترميز، فهو فوري ويحافظ على الجودة، لكن البداية قد تنزاح قليلاً لأقرب إطار مفتاحي. الدقيق يعيد الترميز فيقص في النقطة بالضبط، لكنه أبطأ خصوصاً على الجوال.",
  },
  {
    q: "كيف يعمل الضغط لحجم محدد؟",
    a: "تختار الحجم (مثل 16 MB لواتساب)، فيحسب Cutwave معدل البت المناسب لمدة المقطع ويخفض الدقة إذا لزم، ليخرج الملف أصغر من الحد.",
  },
  {
    q: "كيف أثبّته كتطبيق؟",
    a: "على أندرويد والكمبيوتر اضغط زر \"تثبيت التطبيق\" أعلى الصفحة. على الآيفون: زر المشاركة ثم \"إضافة إلى الشاشة الرئيسية\".",
  },
  {
    q: "هل يعمل على الآيفون والأندرويد؟",
    a: "نعم، على أي متصفح حديث. للملفات الطويلة جداً استخدم الوضع السريع على الجوال.",
  },
];

export default function Home() {
  return (
    <>
      <Background />

      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="brand" dir="ltr">
            <Logo size={34} />
            <span>Cutwave</span>
          </Link>
          <nav className="nav">
            <a href="#how" className="nav-link hide-sm">
              طريقة الاستخدام
            </a>
            <a href="#faq" className="nav-link hide-sm">
              الأسئلة
            </a>
            <InstallButton />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <span className="pill">
            <Lock size={14} />
            مجاني · بدون تسجيل · بدون رفع
          </span>
          <h1>
            قص الفيديو والصوت
            <br />
            <span className="grad">باحترافية، داخل متصفحك</span>
          </h1>
          <p>
            حدد البداية والنهاية ثم صدّر المقطع في ثوانٍ. يعمل على الجوال
            والكمبيوتر، وملفاتك لا تغادر جهازك.
          </p>
        </section>

        <section id="editor" className="editor-section rise" style={{ animationDelay: "0.3s" }}>
          <Cutter />
        </section>

        <section id="how" className="section">
          <header className="section-head" data-reveal>
            <span className="eyebrow">
              <Scissors size={14} />
              طريقة الاستخدام
            </span>
            <h2>ثلاث خطوات فقط</h2>
          </header>
          <ol className="steps">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="step spot"
                data-reveal
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span className="step-num mono">{i + 1}</span>
                <span className="feature-icon">
                  <s.icon size={20} />
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section">
          <header className="section-head" data-reveal>
            <span className="eyebrow">
              <BadgeCheck size={14} />
              المميزات
            </span>
            <h2>كل ما تحتاجه للقص، بدون تعقيد</h2>
          </header>
          <div className="features">
            {features.map((f, i) => (
              <article
                key={f.title}
                className="feature spot"
                data-reveal
                style={{ transitionDelay: `${(i % 3) * 90}ms` }}
              >
                <span className="feature-icon">
                  <f.icon size={20} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="section">
          <header className="section-head" data-reveal>
            <span className="eyebrow">الأسئلة الشائعة</span>
            <h2>عندك سؤال؟</h2>
          </header>
          <div className="faq">
            {faqs.map((f) => (
              <details key={f.q} data-reveal>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="brand brand-sm" dir="ltr">
            <Logo size={24} />
            <span>Cutwave</span>
          </span>
          <span>قص الفيديو والصوت بخصوصية تامة.</span>
        </div>
      </footer>
    </>
  );
}
