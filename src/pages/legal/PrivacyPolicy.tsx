// Public, unauthenticated page — the URL Google Play's own crawler fetches
// for the app's privacy policy declaration, plus the one real people open
// from the Play Store listing. Content mirrors the in-app copy (see the
// Flutter app's terms_privacy_page.dart) so the two never drift apart.
const SECTIONS: { id: string; title: string; body: string }[] = [
  {
    id: 'terms',
    title: 'Условия использования',
    body: 'Оформляя заказ через Freshline, вы соглашаетесь оплатить указанную сумму выбранным способом и предоставить точный адрес доставки. Сроки доставки — ориентировочные и могут меняться от загруженности продавца и погодных условий.',
  },
  {
    id: 'collect',
    title: 'Какие данные мы собираем',
    body: 'Чтобы Freshline мог принимать и доставлять заказы, мы просим только то, что для этого действительно нужно: название организации, контактное лицо и телефон — чтобы курьер знал, куда и к кому обращаться; email и пароль — для входа в аккаунт; адрес доставки — вы выбираете его из списка вручную, мы не отслеживаем местоположение через GPS; историю и состав заказов; отзыв и фото после доставки — только если вы сами решили их оставить; сообщения в чате поддержки — если вы к нам написали.',
  },
  {
    id: 'why',
    title: 'Зачем они нужны',
    body: 'Каждое поле данных работает на одну простую задачу — довезти ваш заказ. Мы не показываем рекламу и не передаём ваши данные рекламным сетям — их у нас попросту нет.',
  },
  {
    id: 'camera',
    title: 'Камера и фото в отзывах',
    body: 'После доставки вы можете (по желанию) написать отзыв и приложить до трёх фотографий. Приложение запрашивает доступ к камере и галерее только в этот момент и только с вашего явного разрешения. Ничего не снимается и не отправляется в фоне.',
  },
  {
    id: 'who',
    title: 'Кто видит ваши данные',
    body: 'Доступ есть у команды Freshline, которая обрабатывает заказы, и у курьера — но только к тем данным, что нужны для конкретной доставки. Мы не продаём и не передаём ваши данные третьим лицам в маркетинговых целях.',
  },
  {
    id: 'storage',
    title: 'Где и как долго хранятся данные',
    body: 'Данные хранятся у нашего облачного провайдера (Supabase) на защищённых серверах, передаются в зашифрованном виде (HTTPS/TLS) и доступны только через аккаунт с паролем — пока ваш аккаунт активен.',
  },
  {
    id: 'rights',
    title: 'Ваши права',
    body: 'Вы можете в любой момент посмотреть и изменить свои данные в разделе профиля. Если хотите полностью удалить аккаунт и все связанные данные — это можно сделать в любой момент, см. отдельную страницу об удалении аккаунта.',
  },
  {
    id: 'children',
    title: 'Дети',
    body: 'Freshline работает с юридическими лицами (компаниями и организациями), а не с частными покупателями, и не предназначен для использования детьми младше 13 лет.',
  },
  {
    id: 'changes',
    title: 'Изменения политики',
    body: 'Если что-то изменится, мы обновим эту страницу и дату вверху. Пользоваться приложением после изменений означает, что вы с ними согласны.',
  },
]

export default function PrivacyPolicy() {
  return (
    <div
      style={{
        maxWidth: 720,
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
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px' }}>Условия использования и политика конфиденциальности</h1>
      <p style={{ color: '#6b6b6b', marginBottom: 24 }}>
        Freshline — сервис доставки свежих продуктов от местных фермеров, молочных лавок и пекарен для кафе,
        ресторанов и других организаций.
      </p>
      <p
        style={{
          display: 'inline-block',
          background: '#e8f2e6',
          color: '#1f5a1f',
          fontSize: 13,
          fontWeight: 600,
          padding: '5px 12px',
          borderRadius: 100,
          marginBottom: 32,
        }}
      >
        Действует с 25 августа 2026
      </p>

      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} style={{ marginTop: i === 0 ? 0 : 40, paddingTop: i === 0 ? 0 : 32, borderTop: i === 0 ? 'none' : '1px solid #e2e6dd' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>{s.title}</h2>
          <p style={{ fontSize: 15.5, margin: 0, maxWidth: '62ch' }}>{s.body}</p>
        </section>
      ))}

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e2e6dd', color: '#6b6b6b', fontSize: 13 }}>
        Freshline — доставка свежих продуктов от соседних фермеров и лавок для кафе, ресторанов и других организаций.
      </footer>
    </div>
  )
}
