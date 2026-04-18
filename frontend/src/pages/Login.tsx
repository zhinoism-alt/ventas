import { SignIn } from '@clerk/clerk-react'

export default function Login() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0f172a 50%, #1a0a2e 100%)' }}
    >
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            VP
          </div>
          <h1 className="text-2xl font-bold text-white">VentasPro</h1>
          <p className="text-slate-400 text-sm mt-1">Sistema de gestion de negocios</p>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorBackground: '#1e293b',
              colorText: '#ffffff',
              colorPrimary: '#6366f1',
              colorInputBackground: '#0f172a',
              colorInputText: '#ffffff',
              colorTextSecondary: '#94a3b8',
              colorDanger: '#f87171',
              borderRadius: '0.75rem',
            },
            elements: {
              card: 'shadow-2xl',
              formButtonPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
              footerActionLink: 'text-indigo-400 hover:text-indigo-300',
            },
          }}
          redirectUrl="/"
        />

        <p className="text-center text-xs text-slate-600 mt-6">
          zhinoism.online &bull; Uso privado
        </p>
      </div>
    </div>
  )
}
