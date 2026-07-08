import type { Metadata } from "next";

import { SignupForm } from "./_components/signup-form";

export const metadata: Metadata = {
  title: "회원가입",
};

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <SignupForm />
    </div>
  );
}
