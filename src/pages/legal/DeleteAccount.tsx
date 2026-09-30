// Public, unauthenticated page — the URL Google Play's "account deletion"
// declaration points to. Per Google's own checklist this page must, on its
// own, name the app, show the deletion steps, and say what data is deleted
// vs. kept and for how long — so it stands alone rather than just linking
// into the privacy policy.
export default function DeleteAccount() {
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
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 24px' }}>Удаление аккаунта</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Как запросить удаление</h2>
        <ol style={{ paddingLeft: 20, fontSize: 15.5 }}>
          <li style={{ marginBottom: 8 }}>Откройте приложение Freshline и войдите в свой аккаунт.</li>
          <li style={{ marginBottom: 8 }}>Перейдите в Профиль → Поддержка (чат с командой Freshline).</li>
          <li style={{ marginBottom: 8 }}>
            Напишите, что хотите удалить аккаунт, и укажите логин или email, на который он зарегистрирован.
          </li>
          <li>Мы подтвердим запрос и удалим аккаунт — обычно в течение нескольких рабочих дней.</li>
        </ol>
        <p style={{ fontSize: 15.5 }}>
          Если у вас нет доступа к приложению, напишите с того же email на{' '}
          <a href="mailto:yahyo.info@gmail.com" style={{ color: '#1f5a1f', fontWeight: 600 }}>
            yahyo.info@gmail.com
          </a>{' '}
          с той же просьбой.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Что удаляется</h2>
        <p style={{ fontSize: 15.5 }}>
          Имя, контактные данные, адрес доставки, история и состав заказов, отзывы и фотографии, сообщения в чате
          поддержки, вход в аккаунт (логин и пароль) и push-уведомления, привязанные к устройству.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Сроки</h2>
        <p style={{ fontSize: 15.5 }}>
          Удаление выполняется в течение 30 дней с момента подтверждённого запроса. Данные не хранятся дольше этого
          срока ни в каком виде.
        </p>
      </section>

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e2e6dd', color: '#6b6b6b', fontSize: 13 }}>
        Подробнее о работе с данными — в{' '}
        <a href="/legal/privacy" style={{ color: '#1f5a1f' }}>
          политике конфиденциальности
        </a>
        .
      </footer>
    </div>
  )
}
