import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy notice" };

const CONTACT = "help@contentcreatorlab.cc";

const SECTIONS: [string, string][] = [
  [
    "Who runs this app",
    `Content Creator Lab maintains Clipscript Studio. Questions and requests go to ${CONTACT}.`,
  ],
  [
    "What stays on your computer",
    "Scripts, notes, personas, videos, clips and your sign-in tokens are stored in this app's data folder. Tokens and saved keys are encrypted. The maintainers receive none of it.",
  ],
  [
    "What goes to OpenAI",
    "When you connect ChatGPT, OpenAI shares your name, email and profile picture with this app, and only your email is kept. What you type, upload or ask the app to write goes to OpenAI on your ChatGPT plan, under your own agreement with OpenAI. It counts toward your plan's usage. This app cannot read your ChatGPT conversations or memories.",
  ],
  [
    "What goes to others",
    "If you use Clip Studio, your video's audio goes to AssemblyAI under your own AssemblyAI account. Your browser's voices may send spoken text to the browser's voice provider. Google Fonts receives your IP address when the script page loads.",
  ],
  [
    "Other people's details",
    "Leave out other people's names and private details, such as health, religion or family matters, unless you have their permission.",
  ],
  [
    "Who can use it",
    "You must be 18 or older. Do not enter personal information about children.",
  ],
  [
    "Your choices",
    "Disconnect ChatGPT in Settings, or in ChatGPT under Settings, Security and login. Delete your data in Settings and in Your data inside Script Writer. Copies OpenAI or AssemblyAI already received follow their terms.",
  ],
];

export default function PrivacyPage() {
  return (
    <div className="p-4 sm:p-6">
      <article className="mx-auto flex max-w-2xl flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy notice
        </h1>
        <p className="text-muted-foreground text-sm">
          Draft. A lawyer has not reviewed this notice yet.
        </p>
        {SECTIONS.map(([heading, body]) => (
          <section key={heading} className="flex flex-col gap-1.5">
            <h2 className="font-medium">{heading}</h2>
            <p className="text-muted-foreground text-sm leading-6">{body}</p>
          </section>
        ))}
      </article>
    </div>
  );
}
