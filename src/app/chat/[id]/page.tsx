"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Send, ChevronLeft, MoreVertical, User, RefreshCw, Trash2, Info } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const [character, setCharacter] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      const charId = params.id as string;
      
      const { data: charData } = await supabase
        .from("characters")
        .select("*")
        .eq("id", charId)
        .single();

      const { data: personaData } = await supabase
        .from("personas")
        .select("*")
        .eq("is_default", true)
        .limit(1);

      if (!personaData || personaData.length === 0) {
        const { data: anyPersona } = await supabase
          .from("personas")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);
        if (anyPersona && anyPersona.length > 0) setPersona(anyPersona[0]);
      } else {
        setPersona(personaData[0]);
      }

      if (charData) setCharacter(charData);

      setMessages([
        {
          id: "greeting",
          role: "assistant",
          content: charData?.greeting || "Hello!",
          created_at: new Date().toISOString(),
        },
      ]);
      setLoading(false);
    }
    fetchData();
  }, [params.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, streamingContent]);

  const buildPrompt = (userInput: string) => {
    const charInfo = character ? `You are ${character.name}, ${character.title}. ${character.personality || ""}` : "";
    const personaInfo = persona ? `The user's name is ${persona.name}. ${persona.personality || ""}` : "";
    const context = messages
      .slice(-10)
      .map((m) => `${m.role === "user" ? "User" : character?.name || "Assistant"}: ${m.content}`)
      .join("\n");
    
    return `${charInfo}\n${personaInfo}\n\nConversation:\n${context}\nUser: ${userInput}\n${character?.name || "Assistant"}:`;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      role: "user",
      content: input,
      created_at: new Date().toISOString(),
    };

    const prompt = buildPrompt(input);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          max_tokens: 256,
        }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      console.log("Response received, status:", response.status);
      const fullContent = await response.text();
      console.log("Full content received, length:", fullContent.length);

      const aiMessage: Message = {
        id: Math.random().toString(),
        role: "assistant",
        content: fullContent || "I apologize, I couldn't generate a response.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to get response. Please try again.");
      const fallbackMessage: Message = {
        id: Math.random().toString(),
        role: "assistant",
        content: "I'm having trouble connecting right now. Please try again.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsTyping(false);
      setStreamingContent("");
    }
  };

  const startNewChat = () => {
    setMessages([
      {
        id: "greeting",
        role: "assistant",
        content: character?.greeting || "Hello!",
        created_at: new Date().toISOString(),
      },
    ]);
    toast.success("Started a new chat!");
  };

  const deleteChat = () => {
    setShowDeleteDialog(false);
    toast.success("Chat deleted!");
    router.push("/");
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-matcha"></div>
    </div>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-white relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-matcha/5 blur-[120px] -z-10 rounded-full" />
      
      <header className="flex items-center justify-between p-4 border-b border-white/5 backdrop-blur-md bg-black/50 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="rounded-full hover:bg-white/10">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 ring-2 ring-matcha/50">
              <AvatarImage src={character.avatar_url} />
              <AvatarFallback>{character.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-bold text-sm leading-none">{character.name}</h2>
              <p className="text-[10px] text-matcha font-medium uppercase tracking-tighter mt-1">{character.title}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-white/10"
            onClick={() => setShowInfoPanel(!showInfoPanel)}
          >
            <Info className="w-5 h-5 text-zinc-500" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                <MoreVertical className="w-5 h-5 text-zinc-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl border-zinc-800 bg-zinc-900">
              <DropdownMenuItem onClick={startNewChat} className="gap-2 cursor-pointer rounded-xl">
                <RefreshCw className="w-4 h-4" />
                Start New Chat
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)} 
                className="gap-2 cursor-pointer text-red-400 focus:text-red-400 rounded-xl"
              >
                <Trash2 className="w-4 h-4" />
                Delete Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AnimatePresence>
        {showInfoPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="p-4 space-y-3 max-w-3xl mx-auto">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Personality</span>
                <p className="text-sm text-zinc-300 mt-1">{character.personality || "No personality defined"}</p>
              </div>
              {persona && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Chatting as</span>
                  <p className="text-sm text-matcha mt-1">{persona.name}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth custom-scrollbar" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <Avatar className="w-8 h-8 flex-shrink-0 border border-white/10">
                    <AvatarImage src={msg.role === "assistant" ? character.avatar_url : ""} />
                    <AvatarFallback className={msg.role === "user" ? "bg-matcha text-black" : "bg-zinc-800"}>
                      {msg.role === "user" ? <User className="w-4 h-4" /> : character.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`p-4 rounded-[1.5rem] text-sm leading-relaxed ${
                    msg.role === "user" 
                      ? "bg-matcha text-black rounded-tr-none font-medium" 
                      : "bg-zinc-900 border border-zinc-800 rounded-tl-none text-zinc-200"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className={`flex gap-3 max-w-[85%]`}>
                <Avatar className="w-8 h-8 flex-shrink-0 border border-white/10">
                  <AvatarImage src={character.avatar_url} />
                  <AvatarFallback className="bg-zinc-800">
                    {character.name[0]}
                  </AvatarFallback>
                </Avatar>
                {streamingContent ? (
                  <div className="p-4 rounded-[1.5rem] text-sm leading-relaxed bg-zinc-900 border border-zinc-800 rounded-tl-none text-zinc-200">
                    {streamingContent}
                    <span className="inline-block w-1 h-4 bg-matcha ml-1 animate-pulse" />
                  </div>
                ) : (
                  <div className="flex gap-3 items-center text-zinc-500 text-xs bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
                    <div className="flex gap-1">
                      <span className="w-1 h-1 bg-matcha rounded-full animate-bounce" />
                      <span className="w-1 h-1 bg-matcha rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1 h-1 bg-matcha rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    {character.name} is typing...
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="p-4 bg-black/50 backdrop-blur-xl border-t border-white/5">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto relative group">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${character.name}...`}
            className="h-14 rounded-full bg-zinc-900/80 border-zinc-800 pr-14 focus:border-matcha focus:ring-matcha transition-all"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full w-10 h-10 bg-matcha hover:bg-matcha-dark text-black transition-all disabled:opacity-50 disabled:bg-zinc-800"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-[9px] text-zinc-600 text-center mt-3 font-medium uppercase tracking-widest">
          Remember: Everything Characters say is made up!
        </p>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all messages in this conversation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteChat} className="rounded-full bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
