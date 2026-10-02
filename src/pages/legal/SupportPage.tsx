// Public, unauthenticated page — the "Support URL" App Store Connect asks
// for. Must show a real way to reach someone.
export default function SupportPage() {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '48px 20px 80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#1a1a1a',
        lineHeight: 1.65,
      }}
    >
      <p style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b6b6b', marginBottom: 8 }}>
        Freshline
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 24px' }}>Поддержка</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Написать нам</h2>
        <p style={{ fontSize: 15.5 }}>
          Если у вас вопрос по заказу, доставке или входу в аккаунт, откройте в приложении Профиль → Поддержка — это
          чат с командой Freshline, мы отвечаем в рабочее время.
        </p>
        <p style={{ fontSize: 15.5 }}>
          Если приложение не открывается или вы не можете войти, напишите на{' '}
          <a href="mailto:yahyo.info@gmail.com" style={{ color: '#1f5a1f', fontWeight: 600 }}>
            yahyo.info@gmail.com
          </a>{' '}
          — укажите название компании и логин, и мы поможем.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Полезные ссылки</h2>
        <p style={{ fontSize: 15.5 }}>
          <a href="/legal/privacy" style={{ color: '#1f5a1f' }}>
            Политика конфиденциальности
          </a>
          {' · '}
          <a href="/legal/delete-account" style={{ color: '#1f5a1f' }}>
            Удаление аккаунта
          </a>
        </p>
      </section>
    </div>
  )
}
