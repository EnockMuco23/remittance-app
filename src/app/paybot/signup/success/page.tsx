export default function PaybotSignupSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-lg rounded-lg bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-bold">
          Registration Submitted
        </h1>

        <p className="mt-4 text-gray-600">
          Your Paybot application has been submitted. Management must approve
          your account before you can access the Paybot dashboard.
        </p>
      </div>
    </main>
  );
}