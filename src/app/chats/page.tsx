"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

interface ChatSession {
  id: string;
  character_id: string;
  persona_id: string | null;
  created_at: string;
  updated_at: string;
  character?: {
    id: string;
    name: string;
    title: string;
    avatar_url: string;
  };
  last_message?: string;
  message_count?: number;
}

export default function ChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChats() {
      const { data: chatsData, error } = await supabase
        .from("chats")
        .select(`
          *,
          character:characters(id, name, title, avatar_url)
        `)
        .order("updated_at", { ascending: false });

      if (chatsData) {
        const chatsWithMessages = await Promise.all(
          chatsData.map(async (chat: any) => {
            const { data: messages } = await supabase
              .from("messages")
              .select("content")
              .eq("chat_id", chat.id)
              .order("created_at", { ascending: false })
              .limit(1);

            const { count } = await supabase
              .from("messages")
              .select("*", { count: "exact", head: true })
              .eq("chat_id", chat.id);

            return {
              ...chat,
              last_message: messages?.[0]?.content || "No messages yet",
              message_count: count || 0,
            };
          })
        );
        setChats(chatsWithMessages);
      }
      setLoading(false);
    }
    fetchChats();
  }, []);

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("messages").delete().eq("chat_id", chatId);
    await supabase.from("chats").delete().eq("id", chatId);
    setChats(chats.filter((c) => c.id !== chatId));
    toast.success("Chat deleted");
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-matcha"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-6 py-12 max-w-4xl mx-auto pb-32">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex items-center gap-3">
          <MessageSquare className="w-8 h-8 text-matcha" />
          <h1 className="text-3xl font-black tracking-tight">Your Chats</h1>
        </div>

        {chats.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <MessageSquare className="w-16 h-16 text-zinc-700 mx-auto" />
            <p className="text-zinc-500 text-lg">No chat history yet</p>
            <p className="text-zinc-600 text-sm">Start chatting with a character to see your conversations here</p>
            <Button
              onClick={() => router.push("/")}
              className="mt-4 rounded-full bg-matcha hover:bg-matcha-dark text-black"
            >
              Browse Characters
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {chats.map((chat, index) => (
                <motion.div
                  key={chat.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => router.push(`/chat/${chat.character_id}?chat=${chat.id}`)}
                  className="group relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 hover:border-matcha/50 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="w-14 h-14 ring-2 ring-zinc-800 group-hover:ring-matcha/50 transition-all">
                      <AvatarImage src={chat.character?.avatar_url} />
                      <AvatarFallback className="bg-zinc-800 text-lg">
                        {chat.character?.name?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white truncate">
                          {chat.character?.name || "Unknown Character"}
                        </h3>
                        <span className="text-[10px] text-matcha bg-matcha/10 px-2 py-0.5 rounded-full">
                          {chat.message_count} messages
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {chat.character?.title}
                      </p>
                      <p className="text-sm text-zinc-400 truncate mt-2">
                        {chat.last_message}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(chat.updated_at)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => deleteChat(chat.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </main>
  );
}
