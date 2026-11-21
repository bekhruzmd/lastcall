import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import FeedPage from './student/FeedPage';

const TicketPage = lazy(() => import('./student/TicketPage'));
const MePage = lazy(() => import('./student/MePage'));
const EventsPage = lazy(() => import('./student/EventsPage'));
const PostPage = lazy(() => import('./officer/PostPage'));
const OfficerPage = lazy(() => import('./officer/OfficerPage'));
const BoardPage = lazy(() => import('./board/BoardPage'));
const AboutPage = lazy(() => import('./landing/AboutPage'));
const LeaderboardPage = lazy(() => import('./student/LeaderboardPage'));

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) return <main style={{ padding: 24 }}>
      <h1>Could not open this page</h1>
      <p>Check your connection, then reload to try again.</p>
      <button style={{ minHeight: 44, padding: '8px 16px' }} onClick={() => window.location.reload()}>Reload page</button>
      <p><a href="/">Back to the food feed</a></p>
    </main>;
    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <a href="#main-content" className="sr-only sr-only-focusable">
        Skip to content
      </a>
      <PageErrorBoundary>
        <Suspense fallback={<main style={{ padding: 24 }}><p role="status">Loading page…</p></main>}>
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/ticket/:claimId" element={<TicketPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/post" element={<PostPage />} />
          <Route path="/officer/:postId" element={<OfficerPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<FeedPage />} />
        </Routes>
        </Suspense>
      </PageErrorBoundary>
    </BrowserRouter>
  );
}
