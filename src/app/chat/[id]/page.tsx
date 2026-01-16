"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  DropdownMenuLabel,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Send,
  ChevronLeft,
  MoreVertical,
  User,
  RefreshCw,
  Trash2,
  Info,
  ImageIcon,
  Brain,
  ChevronDown,
  Sparkles,
  Check,
  Users
} from "lucide-react";
import { DEFAULT_MODELS, ModelConfig, summarizeContext, DEFAULT_SFW_SYSTEM_PROMPT, DEFAULT_NSFW_SYSTEM_PROMPT } from "@/lib/openrouter";

function parseNarrationContent(content: string): React.ReactNode {
  const regex = /(\*[^*]+\*)|("[^"]+")/;
  const parts = content.split(regex);

  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <span key={i} className="text-red-500 italic font-medium">
          {part.slice(1, -1)}
        </span>
      );
    }
    if (part.startsWith('"') && part.endsWith('"')) {
      return (
        <span key={i} className="text-white font-bold">
          {part}
        </span>
      );
    }
    return <span key={i} className="text-zinc-400">{part}</span>;
  });
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  image?: string;
  created_at: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [character, setCharacter] = useState<any>(null);
  const [persona, setPersona] = useState<any>(null);
  const [allPersonas, setAllPersonas] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [chatId, setChatId] = useState<string | null>(null);

  const [models, setModels] = useState<ModelConfig[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(DEFAULT_MODELS[0]);
  const [imageInput, setImageInput] = useState<string | null>(null);
  const [settings, setSettings] = useState({ sfwSystemPrompt: DEFAULT_SFW_SYSTEM_PROMPT, nsfwSystemPrompt: DEFAULT_NSFW_SYSTEM_PROMPT, maxTokens: 512 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveMessageToDb = async (message: Message, currentChatId: string) => {
    await supabase.from("messages").insert({
      chat_id: currentChatId,
      character_id: params.id as string,
      persona_id: persona?.id || null,
      role: message.role,
      content: message.content,
      thinking: message.thinking || null,
    });
  };

  const createOrGetChat = async (characterId: string, personaId: string | null): Promise<string> => {
    const existingChatId = searchParams.get("chat");
    if (existingChatId) {
      return existingChatId;
    }

    const { data: existingChat } = await supabase
      .from("chats")
      .select("id")
      .eq("character_id", characterId)
      .eq("persona_id", personaId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (existingChat) {
      return existingChat.id;
    }

    const { data: newChat } = await supabase
      .from("chats")
      .insert({
        character_id: characterId,
        persona_id: personaId,
      })
      .select("id")
      .single();

    return newChat?.id || crypto.randomUUID();
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem("orchids_settings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({
          sfwSystemPrompt: parsed.sfwSystemPrompt || parsed.systemPrompt || DEFAULT_SFW_SYSTEM_PROMPT,
          nsfwSystemPrompt: parsed.nsfwSystemPrompt || DEFAULT_NSFW_SYSTEM_PROMPT,
          maxTokens: parsed.maxTokens || 512,
        });
        if (parsed.models?.length > 0) {
          setModels(parsed.models);
        }
      } catch { }
    }

    const savedModel = localStorage.getItem("orchids_selected_model");
    if (savedModel) {
      try {
        const parsed = JSON.parse(savedModel);
        setSelectedModel(parsed);
      } catch { }
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      const charId = params.id as string;

      const { data: charData } = await supabase
        .from("characters")
        .select("*")
        .eq("id", charId)
        .single();

      const { data: allPersonaData } = await supabase
        .from("personas")
        .select("*")
        .order("created_at", { ascending: false });

      let selectedPersona = null;
      if (allPersonaData && allPersonaData.length > 0) {
        setAllPersonas(allPersonaData);
        selectedPersona = allPersonaData.find((p: any) => p.is_default) || allPersonaData[0];
        setPersona(selectedPersona);
      }

      if (charData) setCharacter(charData);

      const currentChatId = await createOrGetChat(charId, selectedPersona?.id || null);
      setChatId(currentChatId);

      const { data: savedMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", currentChatId)
        .order("created_at", { ascending: true });

      if (savedMessages && savedMessages.length > 0) {
        setMessages(savedMessages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          thinking: m.thinking || undefined,
          created_at: m.created_at,
        })));
      } else {
        const greetingMessage: Message = {
          id: "greeting",
          role: "assistant",
          content: charData?.greeting || "Hello!",
          created_at: new Date().toISOString(),
        };
        setMessages([greetingMessage]);
        await saveMessageToDb(greetingMessage, currentChatId);
      }

      setLoading(false);
    }
    fetchData();
  }, [params.id, searchParams]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, streamingContent]);

  const selectModel = (model: ModelConfig) => {
    setSelectedModel(model);
    localStorage.setItem("orchids_selected_model", JSON.stringify(model));
    toast.success(`Switched to ${model.name}`);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedModel.supportsImage) {
      toast.error("Selected model doesn't support images");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImageInput(base64);
      toast.success("Image attached!");
    };
    reader.readAsDataURL(file);
  };

    const handleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isTyping || !chatId) return;

      // Warn if trying to send image with non-vision model
      if (imageInput && !selectedModel.supportsImage) {
        toast.warning("Current model doesn't support images. Image will be ignored.");
      }

      const userMessage: Message = {
        id: Math.random().toString(),
        role: "user",
        content: input,
        image: selectedModel.supportsImage ? imageInput || undefined : undefined,
        created_at: new Date().toISOString(),
      };

      // Generate context summary from last 4 messages (before current message)
      const contextSummary = messages.length >= 2 ? summarizeContext(
        messages.slice(-4).map(m => ({ role: m.role, content: m.content }))
      ) : "";

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setImageInput(null);
      setIsTyping(true);
      setStreamingContent("");
      setStreamingThinking("");

      await saveMessageToDb(userMessage, chatId);

      try {
        // Build conversation history (last N messages for context window)
        const recentMessages = [...messages, userMessage].slice(-10).map(m => ({
          role: m.role,
          content: m.content,
          image: m.image,
        }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: recentMessages,
            model: selectedModel.id,
            maxTokens: settings.maxTokens,
            systemPrompt: character?.tags?.includes("NSFW") ? settings.nsfwSystemPrompt : settings.sfwSystemPrompt,
            characterName: character?.name,
            characterPersonality: character?.personality,
            characterScenario: character?.scenario,
            characterExampleDialogue: character?.example_dialogue,
            userPersona: persona ? `${persona.name}: ${persona.personality || ""}` : undefined,
            contextSummary: contextSummary || undefined,
          }),
        });

        if (!response.ok) throw new Error("API request failed");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullContent = "";
        let fullThinking = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
                if (parsed.content) {
                  fullContent += parsed.content;
                  // If we have fullContent from API (cleaned of think tags), use it
                  setStreamingContent(parsed.fullContent !== undefined ? parsed.fullContent : fullContent);
                }
              if (parsed.thinking) {
                fullThinking = parsed.thinking;
                setStreamingThinking(fullThinking);
              }
            } catch { }
          }
        }

        const aiMessage: Message = {
          id: Math.random().toString(),
          role: "assistant",
          content: fullContent || "I apologize, I couldn't generate a response.",
          thinking: fullThinking || undefined,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        await saveMessageToDb(aiMessage, chatId);

        await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
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
        setStreamingThinking("");
      }
    };

  const startNewChat = async () => {
    const { data: newChat } = await supabase
      .from("chats")
      .insert({
        character_id: params.id as string,
        persona_id: persona?.id || null,
      })
      .select("id")
      .single();

    if (newChat) {
      setChatId(newChat.id);
      const greetingMessage: Message = {
        id: "greeting",
        role: "assistant",
        content: character?.greeting || "Hello!",
        created_at: new Date().toISOString(),
      };
      setMessages([greetingMessage]);
      await saveMessageToDb(greetingMessage, newChat.id);
      toast.success("Started a new chat!");
    }
  };

  const deleteChat = async () => {
    if (chatId) {
      await supabase.from("messages").delete().eq("chat_id", chatId);
      await supabase.from("chats").delete().eq("id", chatId);
    }
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

      <header className="fixed top-0 left-0 right-0 flex items-center justify-between p-4 border-b border-white/5 backdrop-blur-md bg-black/80 z-40">
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
            <DropdownMenuContent align="end" className="rounded-2xl border-zinc-800 bg-zinc-900 w-56">
              {/* Model Selection */}
              <DropdownMenuLabel className="text-xs text-zinc-500 uppercase tracking-wider">
                Model Selection
              </DropdownMenuLabel>
              {models.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => selectModel(model)}
                  className="gap-2 cursor-pointer rounded-xl"
                >
                  <div className="flex items-center gap-2 flex-1">
                    {model.supportsThinking && <Brain className="w-3 h-3 text-purple-400" />}
                    {model.supportsImage && <ImageIcon className="w-3 h-3 text-blue-400" />}
                    <span className="text-sm">{model.name}</span>
                  </div>
                  {selectedModel.id === model.id && <Check className="w-4 h-4 text-matcha" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-zinc-800" />
              {/* Persona Selection */}
              <DropdownMenuLabel className="text-xs text-zinc-500 uppercase tracking-wider">
                Your Persona
              </DropdownMenuLabel>
              {allPersonas.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => {
                    setPersona(p);
                    toast.success(`Now chatting as ${p.name}`);
                  }}
                  className="gap-2 cursor-pointer rounded-xl"
                >
                  <Users className="w-3 h-3 text-matcha" />
                  <span className="text-sm">{p.name}</span>
                  {persona?.id === p.id && <Check className="w-4 h-4 text-matcha" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-zinc-800" />
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
              <div className="flex items-center gap-2 text-xs text-matcha">
                <Sparkles className="w-3 h-3" />
                Using: {selectedModel.name}
                {selectedModel.supportsThinking && <Brain className="w-3 h-3 text-purple-400" />}
                {selectedModel.supportsImage && <ImageIcon className="w-3 h-3 text-blue-400" />}
              </div>
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

      <div className="flex-1 overflow-y-auto p-4 pt-24 pb-44 space-y-6 scroll-smooth custom-scrollbar" ref={scrollRef}>
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
                  <div className="space-y-2">
                    {/* Thinking section */}
                      {msg.thinking && (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors group">
                            <Brain className="w-3 h-3" />
                            <span>{character.name} is thinking...</span>
                            <ChevronDown className="w-3 h-3 group-data-[state=open]:rotate-180 transition-transform" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 whitespace-pre-wrap">
                              {msg.thinking}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    {/* Image if present */}
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="User uploaded"
                        className="max-w-[200px] rounded-xl border border-zinc-700"
                      />
                    )}
                    {/* Message content */}
                    <div className={`p-4 rounded-[1.5rem] text-sm leading-relaxed ${msg.role === "user"
                      ? "bg-matcha text-black rounded-tr-none font-medium"
                      : "bg-zinc-900 border border-zinc-800 rounded-tl-none text-zinc-200"
                      }`}>
                      {msg.role === "assistant" ? parseNarrationContent(msg.content) : msg.content}
                    </div>
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
                <div className="space-y-2">
                    {streamingThinking && (
                      <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200">
                        <div className="flex items-center gap-2 mb-1">
                          <Brain className="w-3 h-3 text-purple-400" />
                          <span className="text-purple-400 font-medium">{character.name} is thinking...</span>
                        </div>
                        <div className="whitespace-pre-wrap opacity-80">
                          {streamingThinking}
                        </div>
                      </div>
                    )}
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
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="fixed bottom-[4.5rem] left-0 right-0 p-4 bg-black/80 backdrop-blur-xl border-t border-white/5 z-30">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto relative group">
          {/* Image preview */}
          {imageInput && (
            <div className="absolute -top-16 left-0 p-2">
              <div className="relative">
                <img src={imageInput} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-zinc-700" />
                <button
                  type="button"
                  onClick={() => setImageInput(null)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedModel.supportsImage}
              className={`rounded-full w-10 h-10 ${selectedModel.supportsImage
                ? "text-blue-400 hover:bg-blue-500/10"
                : "text-zinc-600 cursor-not-allowed"
                }`}
              title={selectedModel.supportsImage ? "Attach image" : "Model doesn't support images"}
            >
              <ImageIcon className="w-5 h-5" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${character.name}...`}
              className="h-14 rounded-full bg-zinc-900/80 border-zinc-800 pr-14 focus:border-matcha focus:ring-matcha transition-all flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isTyping}
              className="rounded-full w-10 h-10 bg-matcha hover:bg-matcha-dark text-black transition-all disabled:opacity-50 disabled:bg-zinc-800"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
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
