import { SignIn } from '@clerk/clerk-react'

export default function Login() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}
    >
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent)' }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, var(--accent-2), transparent)' }} />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
            VP
          </div>
          <h1 className="text-2xl font-bold text-strong">VentasPro</h1>
          <p className="text-muted text-sm mt-1">Sistema de gestion de negocios</p>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorBackground: 'var(--bg-card)',
              colorText: 'var(--text)',
              colorPrimary: 'var(--accent)',
              colorInputBackground: 'var(--bg-card)',
              colorInputText: 'var(--text)',
              colorTextSecondary: 'var(--text-muted)',
              colorDanger: 'var(--red)',
              borderRadius: '0.75rem',
            },
            elements: {
              card: 'shadow-2xl',
              formButtonPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-strong',
              footerActionLink: 'text-indigo-400 hover:text-indigo-300',
            },
          }}
          redirectUrl="/"
        />

        <p className="text-center text-xs text-faint mt-6">
          zhinoism.online &bull; Uso privado
        </p>
      </div>
    </div>
  )
}
