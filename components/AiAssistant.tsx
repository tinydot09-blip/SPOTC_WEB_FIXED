'use client';

import {
  Bot,
  Mic,
  MicOff,
  SendHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type AiAssistantProps = {
  open: boolean;
  onClose: () => void;
  language: 'en' | 'ta' | string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type SpeechRecognitionEventLike = Event & {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const QUICK_QUESTIONS = [
  'Track my order',
  'Delivery time',
  'Free gifts',
  'Payment help',
  'Return / Exchange',
  'Product information',
] as const;

const TAMIL_QUICK_QUESTIONS = [
  'என் ஆர்டரை டிராக் செய்ய வேண்டும்',
  'டெலிவரி எவ்வளவு நேரம்?',
  'இலவச பரிசுகள் பற்றி சொல்லுங்கள்',
  'பணம் செலுத்த உதவி',
  'ரிட்டர்ன் / எக்சேஞ்ச்',
  'பொருள் விவரம்',
] as const;

export function AiAssistant({
  open,
  onClose,
  language,
}: AiAssistantProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [error, setError] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isTamil = language === 'ta';

  const quickQuestions = useMemo(
    () => (isTamil ? TAMIL_QUICK_QUESTIONS : QUICK_QUESTIONS),
    [isTamil],
  );

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, messages, loading]);

  useEffect(() => {
    if (!open) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setListening(false);

      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel();
      }
    }
  }, [open]);

  const speak = (text: string) => {
    if (!speechEnabled || typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isTamil ? 'ta-IN' : 'en-IN';
    utterance.rate = 0.98;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(isTamil ? 'ta' : 'en-in'),
    );

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  };

  const askAssistant = async (rawQuestion?: string) => {
    const question = String(rawQuestion ?? input).trim();

    if (!question || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: question,
      },
    ];

    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: isTamil ? 'ta' : 'en',
          messages: nextMessages.slice(-8),
        }),
      });

      const data = (await response.json()) as {
        answer?: unknown;
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'AI Assistant could not answer.',
        );
      }

      const answer = String(data.answer || '').trim();

      if (!answer) {
        throw new Error('AI Assistant returned an empty answer.');
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: answer,
        },
      ]);

      speak(answer);
    } catch (reason) {
      console.error('SPOTC AI Assistant failed:', reason);

      const rawMessage = reason instanceof Error ? reason.message : '';

      if (rawMessage.toLowerCase().includes('empty answer')) {
        setError(
          isTamil
            ? 'பதில் கிடைக்கவில்லை. மீண்டும் கேளுங்கள்.'
            : 'I could not complete that answer. Please ask again.',
        );
      } else if (
        rawMessage.toLowerCase().includes('quota') ||
        rawMessage.toLowerCase().includes('billing') ||
        rawMessage.toLowerCase().includes('rate limit')
      ) {
        setError(
          isTamil
            ? 'AI Assistant தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து முயற்சிக்கவும்.'
            : 'AI Assistant is temporarily busy. Please try again shortly.',
        );
      } else {
        setError(
          rawMessage ||
            (isTamil
              ? 'AI Assistant தற்போது கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.'
              : 'AI Assistant is temporarily unavailable. Please try again.'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    if (typeof window === 'undefined' || listening || loading) return;

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setSpeechSupported(false);
      setError(
        isTamil
          ? 'இந்த browser-ல் voice input support இல்லை. கேள்வியை type செய்யுங்கள்.'
          : 'Voice input is not supported in this browser. Please type your question.',
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = isTamil ? 'ta-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript =
        event.results?.[0]?.[0]?.transcript?.trim() || '';

      if (!transcript) return;

      setInput(transcript);
      void askAssistant(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition failed:', event.error);
      setListening(false);

      if (event.error === 'not-allowed') {
        setError(
          isTamil
            ? 'Microphone permission வேண்டும். Browser-ல் microphone-ஐ Allow செய்யுங்கள்.'
            : 'Microphone permission is required. Allow microphone access in your browser.',
        );
      } else if (event.error !== 'aborted') {
        setError(
          isTamil
            ? 'குரலை புரிந்துகொள்ள முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'
            : 'I could not understand that. Please try again.',
        );
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setError('');
    setSpeechSupported(true);
    setListening(true);

    try {
      recognition.start();
    } catch (reason) {
      console.error('Speech recognition start failed:', reason);
      setListening(false);
      recognitionRef.current = null;
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  if (!open) return null;

  return (
    <div
      className="spotc-ai-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="spotc-ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spotc-ai-title"
      >
        <header className="spotc-ai-header">
          <div className="spotc-ai-heading">
            <span className="spotc-ai-avatar" aria-hidden="true">
              <Bot />
            </span>

            <div>
              <strong id="spotc-ai-title">SPOTC AI Assistant</strong>
              <small>
                <span aria-hidden="true">●</span>{' '}
                {isTamil ? 'Online · கேளுங்கள்' : 'Online · Ask anything'}
              </small>
            </div>
          </div>

          <div className="spotc-ai-header-actions">
            <button
              type="button"
              className="spotc-ai-icon-button"
              aria-label={
                speechEnabled ? 'Turn spoken replies off' : 'Turn spoken replies on'
              }
              onClick={() => {
                const next = !speechEnabled;
                setSpeechEnabled(next);

                if (!next) {
                  window.speechSynthesis?.cancel();
                } else if (latestAssistantMessage) {
                  speak(latestAssistantMessage.content);
                }
              }}
            >
              {speechEnabled ? <Volume2 /> : <VolumeX />}
            </button>

            <button
              type="button"
              className="spotc-ai-icon-button"
              aria-label="Close AI Assistant"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
        </header>

        <div className="spotc-ai-body">
          {messages.length === 0 && (
            <>
              <div className="spotc-ai-message spotc-ai-message-assistant">
                <span className="spotc-ai-mini-avatar" aria-hidden="true">
                  <Bot />
                </span>
                <p>
                  {isTamil
                    ? 'வணக்கம்! நான் SPOTC AI Assistant. Type செய்யலாம் அல்லது mic-ஐ tap செய்து பேசலாம்.'
                    : 'Hi! I’m SPOTC AI Assistant. Type your question or tap the mic and speak.'}
                </p>
              </div>

              <div className="spotc-ai-quick-questions">
                {quickQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void askAssistant(question)}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </>
          )}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
              className={
                message.role === 'user'
                  ? 'spotc-ai-message spotc-ai-message-user'
                  : 'spotc-ai-message spotc-ai-message-assistant'
              }
            >
              {message.role === 'assistant' && (
                <span className="spotc-ai-mini-avatar" aria-hidden="true">
                  <Bot />
                </span>
              )}

              <p>{message.content}</p>

              {message.role === 'assistant' && (
                <button
                  type="button"
                  className="spotc-ai-replay"
                  aria-label="Read this answer aloud"
                  onClick={() => speak(message.content)}
                >
                  <Volume2 />
                </button>
              )}
            </div>
          ))}

          {loading && (
            <div className="spotc-ai-message spotc-ai-message-assistant">
              <span className="spotc-ai-mini-avatar" aria-hidden="true">
                <Bot />
              </span>
              <div className="spotc-ai-thinking" aria-label="AI is thinking">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}

          {listening && (
            <div className="spotc-ai-listening" role="status">
              <span className="spotc-ai-listening-pulse">
                <Mic />
              </span>
              <strong>
                {isTamil ? 'கேட்கிறேன்… பேசுங்கள்' : 'Listening… speak now'}
              </strong>
            </div>
          )}

          {error && <div className="spotc-ai-error">{error}</div>}

          {!speechSupported && (
            <div className="spotc-ai-browser-note">
              {isTamil
                ? 'Text chat இன்னும் வேலை செய்யும்.'
                : 'Text chat will still work normally.'}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form
          className="spotc-ai-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void askAssistant();
          }}
        >
          <button
            type="button"
            className={
              listening
                ? 'spotc-ai-mic spotc-ai-mic-listening'
                : 'spotc-ai-mic'
            }
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            onClick={listening ? stopListening : startListening}
            disabled={loading}
          >
            {listening ? <MicOff /> : <Mic />}
          </button>

          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isTamil ? 'உங்கள் கேள்வியை கேளுங்கள்…' : 'Ask anything…'}
            aria-label="Ask SPOTC AI Assistant"
            disabled={loading}
          />

          <button
            type="submit"
            className="spotc-ai-send"
            aria-label="Send question"
            disabled={loading || !input.trim()}
          >
            <SendHorizontal />
          </button>
        </form>
      </section>

      <style jsx global>{`
        .spotc-ai-overlay {
          position: fixed;
          inset: 0;
          z-index: 20000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 18px;
          background: rgba(10, 9, 8, 0.52);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .spotc-ai-panel {
          width: min(100%, 520px);
          max-height: min(82vh, 760px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.3);
        }

        .spotc-ai-header {
          min-height: 70px;
          padding: 13px 14px 13px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #ece8e2;
          background: #ffffff;
        }

        .spotc-ai-heading {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .spotc-ai-avatar {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #ffffff;
          background: linear-gradient(145deg, #22c55e, #15803d);
          box-shadow: 0 6px 18px rgba(34, 197, 94, 0.3);
        }

        .spotc-ai-avatar svg {
          width: 23px;
          height: 23px;
        }

        .spotc-ai-heading strong,
        .spotc-ai-heading small {
          display: block;
        }

        .spotc-ai-heading strong {
          overflow: hidden;
          color: #181715;
          font-size: 16px;
          font-weight: 850;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .spotc-ai-heading small {
          margin-top: 3px;
          color: #16863a;
          font-size: 11px;
          font-weight: 700;
        }

        .spotc-ai-header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .spotc-ai-icon-button {
          width: 36px;
          height: 36px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #34312d;
          background: #f4f1ed;
          cursor: pointer;
        }

        .spotc-ai-icon-button svg {
          width: 18px;
          height: 18px;
        }

        .spotc-ai-body {
          flex: 1;
          min-height: 250px;
          padding: 16px;
          overflow-y: auto;
          overscroll-behavior: contain;
          background: linear-gradient(180deg, #f8f7f5, #f3f4f3);
        }

        .spotc-ai-message {
          position: relative;
          width: fit-content;
          max-width: 88%;
          margin: 0 0 11px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .spotc-ai-message p {
          margin: 0;
          padding: 11px 13px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 520;
          line-height: 1.45;
          white-space: pre-wrap;
        }

        .spotc-ai-message-assistant p {
          border: 1px solid #e6e2dc;
          border-top-left-radius: 5px;
          color: #24211d;
          background: #ffffff;
          box-shadow: 0 4px 13px rgba(30, 24, 16, 0.05);
        }

        .spotc-ai-message-user {
          margin-left: auto;
        }

        .spotc-ai-message-user p {
          border-top-right-radius: 5px;
          color: #14341d;
          background: #dff7e6;
        }

        .spotc-ai-mini-avatar {
          width: 27px;
          height: 27px;
          flex: 0 0 27px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #ffffff;
          background: #199545;
        }

        .spotc-ai-mini-avatar svg {
          width: 16px;
          height: 16px;
        }

        .spotc-ai-replay {
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          padding: 0;
          display: grid;
          place-items: center;
          align-self: flex-end;
          border: 0;
          border-radius: 50%;
          color: #347d4a;
          background: transparent;
          cursor: pointer;
        }

        .spotc-ai-replay svg {
          width: 15px;
          height: 15px;
        }

        .spotc-ai-quick-questions {
          margin: 4px 0 16px 35px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }

        .spotc-ai-quick-questions button {
          min-height: 40px;
          padding: 7px 10px;
          border: 1px solid #ddd8d1;
          border-radius: 999px;
          color: #312e2a;
          background: #ffffff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .spotc-ai-thinking {
          min-height: 40px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #e6e2dc;
          border-radius: 16px;
          border-top-left-radius: 5px;
          background: #ffffff;
        }

        .spotc-ai-thinking i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #8c8984;
          animation: spotc-ai-dot 1.1s infinite ease-in-out;
        }

        .spotc-ai-thinking i:nth-child(2) {
          animation-delay: 0.15s;
        }

        .spotc-ai-thinking i:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes spotc-ai-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }

        .spotc-ai-listening {
          margin: 12px auto;
          padding: 10px 14px;
          width: fit-content;
          display: flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          color: #116b31;
          background: #e6f8eb;
          font-size: 12px;
        }

        .spotc-ai-listening-pulse {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #ffffff;
          background: #17a34a;
          animation: spotc-ai-pulse 1.2s infinite ease-out;
        }

        .spotc-ai-listening-pulse svg {
          width: 16px;
          height: 16px;
        }

        @keyframes spotc-ai-pulse {
          0% { box-shadow: 0 0 0 0 rgba(23, 163, 74, 0.4); }
          100% { box-shadow: 0 0 0 12px rgba(23, 163, 74, 0); }
        }

        .spotc-ai-error,
        .spotc-ai-browser-note {
          margin: 10px 0;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.4;
        }

        .spotc-ai-error {
          color: #8b1e18;
          background: #fff0ef;
          border: 1px solid #ffd7d3;
        }

        .spotc-ai-browser-note {
          color: #665f57;
          background: #f4f1ec;
        }

        .spotc-ai-composer {
          padding: 11px 12px calc(11px + env(safe-area-inset-bottom, 0px));
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr) 46px;
          align-items: center;
          gap: 8px;
          border-top: 1px solid #e8e3dc;
          background: #ffffff;
        }

        .spotc-ai-composer input {
          width: 100%;
          min-width: 0;
          height: 46px;
          padding: 0 15px;
          border: 1px solid #dcd7cf;
          border-radius: 999px;
          outline: 0;
          color: #211f1c;
          background: #faf9f7;
          font-family: inherit;
          font-size: 14px;
        }

        .spotc-ai-composer input:focus {
          border-color: #41a761;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }

        .spotc-ai-mic,
        .spotc-ai-send {
          width: 46px;
          height: 46px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #ffffff;
          cursor: pointer;
        }

        .spotc-ai-mic {
          background: #25221e;
        }

        .spotc-ai-mic-listening {
          background: #d92d20;
          animation: spotc-ai-pulse-red 1.2s infinite ease-out;
        }

        @keyframes spotc-ai-pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(217, 45, 32, 0.35); }
          100% { box-shadow: 0 0 0 12px rgba(217, 45, 32, 0); }
        }

        .spotc-ai-send {
          background: linear-gradient(145deg, #22c55e, #15803d);
        }

        .spotc-ai-mic svg,
        .spotc-ai-send svg {
          width: 20px;
          height: 20px;
        }

        .spotc-ai-mic:disabled,
        .spotc-ai-send:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        @media (min-width: 701px) {
          .spotc-ai-overlay {
            align-items: center;
          }
        }

        @media (max-width: 700px) {
          .spotc-ai-overlay {
            padding: 0 0 calc(84px + env(safe-area-inset-bottom, 0px));
            align-items: flex-end;
          }

          .spotc-ai-panel {
            width: 100%;
            height: min(74dvh, 680px);
            max-height: calc(100dvh - 84px - env(safe-area-inset-bottom, 0px));
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 24px 24px 0 0;
            overflow: hidden;
          }

          .spotc-ai-header {
            flex: 0 0 auto;
          }

          .spotc-ai-body {
            flex: 1 1 auto;
            min-height: 0;
            padding: 14px;
            overflow-y: auto;
          }

          .spotc-ai-composer {
            position: relative;
            z-index: 5;
            flex: 0 0 auto;
            padding: 10px 12px;
            border-top: 1px solid #e8e3dc;
            background: #ffffff;
          }

          .spotc-ai-quick-questions {
            margin-left: 0;
          }
        }

        @media (max-width: 380px) {
          .spotc-ai-heading strong {
            font-size: 14px;
          }

          .spotc-ai-quick-questions button {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}
