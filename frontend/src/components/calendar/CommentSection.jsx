import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchAppointmentComments, addAppointmentComment } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineChat } from 'react-icons/hi';

export default function CommentSection({ leadId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingCmt, setLoadingCmt] = useState(true);
  const scrollRef = useRef(null);

  const loadComments = useCallback(async () => {
    try {
      const data = await fetchAppointmentComments(leadId);
      setComments(data);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCmt(false);
    }
  }, [leadId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addAppointmentComment(leadId, text.trim());
      setText('');
      await loadComments();
    } catch (err) {
      toast.error('Lỗi gửi bình luận');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const roleColor = (role) => {
    if (role === 'admin') return 'text-red-600 dark:text-red-400';
    if (role === 'marketing') return 'text-blue-600 dark:text-blue-400';
    return 'text-green-600 dark:text-green-400';
  };

  const roleBadge = (role) => {
    if (role === 'admin') return 'Admin';
    if (role === 'marketing') return 'Sale';
    return 'Trung tâm';
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineChat className="w-4 h-4 text-surface-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">Trao đổi</span>
        {comments.length > 0 && <span className="text-[10px] bg-primary-100 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded-full font-semibold">{comments.length}</span>}
      </div>

      <div ref={scrollRef} className="max-h-[200px] overflow-y-auto space-y-2 mb-3">
        {loadingCmt ? (
          <p className="text-xs text-surface-400 py-2">Đang tải...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-surface-400 py-2 text-center">Chưa có trao đổi nào</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${
                c.author_role === 'marketing' ? 'bg-blue-500' : c.author_role === 'admin' ? 'bg-red-500' : 'bg-green-500'
              }`}>
                {c.author_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs font-semibold ${roleColor(c.author_role)}`}>{c.author_name}</span>
                  <span className="text-[10px] text-surface-400 bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded">{roleBadge(c.author_role)}</span>
                  <span className="text-[10px] text-surface-400 ml-auto flex-shrink-0">
                    {new Date(c.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-surface-700 dark:text-surface-300 mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập bình luận..."
          className="input-field text-sm py-2 flex-1"
        />
        <button onClick={handleSend} disabled={sending || !text.trim()} className="btn-primary text-xs py-2 px-4 flex-shrink-0">
          {sending ? '...' : 'Gửi'}
        </button>
      </div>
    </div>
  );
}
