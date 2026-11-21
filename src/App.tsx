import { BrowserRouter, Route, Routes } from 'react-router-dom';
import FeedPage from './student/FeedPage';
import TicketPage from './student/TicketPage';
import MePage from './student/MePage';
import EventsPage from './student/EventsPage';
import PostPage from './officer/PostPage';
import OfficerPage from './officer/OfficerPage';
import BoardPage from './board/BoardPage';
import AboutPage from './landing/AboutPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/ticket/:claimId" element={<TicketPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/post" element={<PostPage />} />
        <Route path="/officer/:postId" element={<OfficerPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<FeedPage />} />
      </Routes>
    </BrowserRouter>
  );
}
