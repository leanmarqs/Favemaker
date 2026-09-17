import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  minLength?: number;
  icon?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={icon ? "auth-password-field with-icon" : "auth-password-field"}
      onBlur={(e) => {
        // Clicar no botão de mostrar/ocultar move o foco para o botão, não para o input,
        // então só devemos ocultar quando o foco sai do campo inteiro (input + botão).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShow(false);
      }}
    >
      {icon}
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={128}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setShow(!show)}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
