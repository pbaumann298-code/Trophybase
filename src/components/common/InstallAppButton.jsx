import { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { usePwaInstall } from '../../hooks/usePwaInstall';

const COPY = {
  de: {
    button: 'App installieren',
    title: 'Als App installieren',
    ios1: 'Tippe auf Teilen.',
    ios2: 'Wähle „Zum Home-Bildschirm“.',
    mac1: 'Öffne das Menü Ablage.',
    mac2: 'Wähle „Zum Dock hinzufügen“.',
    close: 'Schließen',
  },
  en: {
    button: 'Install app',
    title: 'Install as an app',
    ios1: 'Tap Share.',
    ios2: 'Choose “Add to Home Screen”.',
    mac1: 'Open the File menu.',
    mac2: 'Choose “Add to Dock”.',
    close: 'Close',
  },
  fr: {
    button: 'Installer l’app',
    title: 'Installer comme application',
    ios1: 'Appuyez sur Partager.',
    ios2: 'Choisissez « Sur l’écran d’accueil ».',
    mac1: 'Ouvrez le menu Fichier.',
    mac2: 'Choisissez « Ajouter au Dock ».',
    close: 'Fermer',
  },
  es: {
    button: 'Instalar app',
    title: 'Instalar como app',
    ios1: 'Toca Compartir.',
    ios2: 'Elige «Añadir a pantalla de inicio».',
    mac1: 'Abre el menú Archivo.',
    mac2: 'Elige «Añadir al Dock».',
    close: 'Cerrar',
  },
  it: {
    button: 'Installa app',
    title: 'Installa come app',
    ios1: 'Tocca Condividi.',
    ios2: 'Scegli «Aggiungi a Home».',
    mac1: 'Apri il menu File.',
    mac2: 'Scegli «Aggiungi al Dock».',
    close: 'Chiudi',
  },
  nl: {
    button: 'App installeren',
    title: 'Als app installeren',
    ios1: 'Tik op Deel.',
    ios2: 'Kies „Zet op beginscherm“.',
    mac1: 'Open het menu Archief.',
    mac2: 'Kies „Zet in Dock“.',
    close: 'Sluiten',
  },
  pt: {
    button: 'Instalar app',
    title: 'Instalar como app',
    ios1: 'Toque em Partilhar.',
    ios2: 'Escolha „Adicionar ao ecrã principal“.',
    mac1: 'Abra o menu Ficheiro.',
    mac2: 'Escolha „Adicionar à Dock“.',
    close: 'Fechar',
  },
  pl: {
    button: 'Zainstaluj aplikację',
    title: 'Zainstaluj jako aplikację',
    ios1: 'Stuknij Udostępnij.',
    ios2: 'Wybierz „Do ekranu początkowego“.',
    mac1: 'Otwórz menu Plik.',
    mac2: 'Wybierz „Dodaj do Docka“.',
    close: 'Zamknij',
  },
  ru: {
    button: 'Установить',
    title: 'Установить как приложение',
    ios1: 'Нажмите «Поделиться».',
    ios2: 'Выберите «На экран Домой».',
    mac1: 'Откройте меню «Файл».',
    mac2: 'Выберите «Добавить в Dock».',
    close: 'Закрыть',
  },
  ja: {
    button: 'アプリをインストール',
    title: 'アプリとしてインストール',
    ios1: '共有をタップします。',
    ios2: '「ホーム画面に追加」を選びます。',
    mac1: 'ファイルメニューを開きます。',
    mac2: '「Dockに追加」を選びます。',
    close: '閉じる',
  },
  ko: {
    button: '앱 설치',
    title: '앱으로 설치',
    ios1: '공유를 누릅니다.',
    ios2: '「홈 화면에 추가」를 선택합니다.',
    mac1: '파일 메뉴를 엽니다.',
    mac2: '「Dock에 추가」를 선택합니다.',
    close: '닫기',
  },
  'zh-hans': {
    button: '安装应用',
    title: '安装为应用',
    ios1: '点按共享。',
    ios2: '选择「添加到主屏幕」。',
    mac1: '打开文件菜单。',
    mac2: '选择「添加到程序坞」。',
    close: '关闭',
  },
  'zh-hant': {
    button: '安裝 App',
    title: '安裝為 App',
    ios1: '點一下分享。',
    ios2: '選擇「加入主畫面」。',
    mac1: '打開檔案選單。',
    mac2: '選擇「加入 Dock」。',
    close: '關閉',
  },
  fi: {
    button: 'Asenna sovellus',
    title: 'Asenna sovelluksena',
    ios1: 'Napauta Jaa.',
    ios2: 'Valitse „Lisää Koti-valikkoon“.',
    mac1: 'Avaa Arkisto-valikko.',
    mac2: 'Valitse „Lisää Dockiin“.',
    close: 'Sulje',
  },
  sv: {
    button: 'Installera app',
    title: 'Installera som app',
    ios1: 'Tryck på Dela.',
    ios2: 'Välj „Lägg till på hemskärmen“.',
    mac1: 'Öppna menyn Arkiv.',
    mac2: 'Välj „Lägg till i Dock“.',
    close: 'Stäng',
  },
  ar: {
    button: 'تثبيت التطبيق',
    title: 'التثبيت كتطبيق',
    ios1: 'اضغط مشاركة.',
    ios2: 'اختر «إضافة إلى الشاشة الرئيسية».',
    mac1: 'افتح قائمة ملف.',
    mac2: 'اختر «إضافة إلى Dock».',
    close: 'إغلاق',
  },
};

function copyFor(locale) {
  return COPY[locale] || COPY.en;
}

function InstallAppButton() {
  const { globalLocale } = useLocale();
  const { hidden, mode, platform, promptInstall } = usePwaInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  if (hidden) return null;

  const copy = copyFor(globalLocale);
  const steps = platform === 'ios' ? [copy.ios1, copy.ios2] : [copy.mac1, copy.mac2];

  const onClick = async () => {
    if (mode === 'native') {
      await promptInstall();
      return;
    }
    setHelpOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-8 items-center rounded-lg border border-zinc-800 bg-[#121314]/90 px-2.5 text-[11px] font-bold text-zinc-300 hover:border-zinc-700 hover:text-white"
      >
        {copy.button}
      </button>
      {helpOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setHelpOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#121314] p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="pwa-install-title" className="text-sm font-bold text-white">{copy.title}</h2>
            <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm text-zinc-300">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-4 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300"
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default InstallAppButton;
