import LoginMethodDropdown from '../components/LoginMethodDropdown';
import { useLocale } from '../context/LocaleContext';

function LoginPage({ onLogin }) {
  const { globalLocale } = useLocale();
  const isDe = globalLocale !== 'en';

  return (
    <div className="max-w-sm mx-auto w-full bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl my-auto">
      <h3 className="text-lg font-bold text-white text-center mb-2">
        {isDe ? 'Anmelden bei TrophyBase' : 'Sign in to TrophyBase'}
      </h3>

      <p className="text-xs text-zinc-500 text-center mb-5 leading-relaxed">
        {isDe
          ? 'Wähle im Menü deine gewünschte Anmelde-Methode aus.'
          : 'Select your preferred sign-in method from the menu.'}
      </p>

      <LoginMethodDropdown
        locale={globalLocale}
        redirectTo={window.location.origin}
        onPasswordLogin={onLogin}
      />
    </div>
  );
}

export default LoginPage;
