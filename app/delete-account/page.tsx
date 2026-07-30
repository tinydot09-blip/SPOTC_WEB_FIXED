export const metadata = {
  title: "Delete Your SPOTC Account",
  description: "Request deletion of your SPOTC account and associated data.",
};

export default function DeleteAccountPage() {
  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "60px 24px",
        lineHeight: 1.8,
      }}
    >
      <h1>Delete Your SPOTC Account</h1>

      <p>
        If you would like to permanently delete your SPOTC account and your
        personal information, you can request account deletion using the
        instructions below.
      </p>

      <h2>How to request account deletion</h2>

      <ol>
        <li>Send an email from your registered email address.</li>
        <li>Use the subject: <strong>Delete My SPOTC Account</strong>.</li>
        <li>Include your registered email address and phone number.</li>
      </ol>

      <p>
        <strong>Email:</strong> support@spotc.in
      </p>

      <h2>Data that will be deleted</h2>

      <ul>
        <li>Your user profile</li>
        <li>Your Shopping Circle information</li>
        <li>Saved products</li>
        <li>Saved addresses</li>
        <li>Uploaded profile information</li>
        <li>Other personal information associated with your account</li>
      </ul>

      <h2>Data that may be retained</h2>

      <p>
        Certain information may be retained where required by applicable laws,
        fraud prevention, dispute resolution, taxation, or security purposes.
      </p>

      <h2>Processing time</h2>

      <p>
        We normally process verified deletion requests within 7 business days.
      </p>

      <h2>Need help?</h2>

      <p>
        Contact us at <strong>support@spotc.in</strong>
      </p>
    </main>
  );
}