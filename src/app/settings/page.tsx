"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
    Settings,
    Brain,
    ImageIcon,
    Plus,
    Trash2,
    ChevronLeft,
    Save,
    Sparkles,
} from "lucide-react";
import Link from "next/link";
import { DEFAULT_MODELS, ModelConfig, DEFAULT_SYSTEM_PROMPT } from "@/lib/openrouter";

interface SettingsData {
    systemPrompt: string;
    maxTokens: number;
    models: ModelConfig[];
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData>({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        maxTokens: 512,
        models: DEFAULT_MODELS,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newModel, setNewModel] = useState({
        id: "",
        name: "",
        supportsThinking: false,
        supportsImage: false,
    });

    useEffect(() => {
        // Load settings from localStorage
        const saved = localStorage.getItem("orchids_settings");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setSettings({
                    systemPrompt: parsed.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                    maxTokens: parsed.maxTokens || 512,
                    models: parsed.models || DEFAULT_MODELS,
                });
            } catch {
                setSettings({ systemPrompt: "", maxTokens: 512, models: DEFAULT_MODELS });
            }
        }
        setLoading(false);
    }, []);

    const saveSettings = () => {
        setSaving(true);
        localStorage.setItem("orchids_settings", JSON.stringify(settings));
        setTimeout(() => {
            setSaving(false);
            toast.success("Settings saved!");
        }, 500);
    };

    const addModel = () => {
        if (!newModel.id || !newModel.name) {
            toast.error("Please fill in all fields");
            return;
        }
        setSettings({
            ...settings,
            models: [...settings.models, { ...newModel }],
        });
        setNewModel({ id: "", name: "", supportsThinking: false, supportsImage: false });
        toast.success("Model added!");
    };

    const removeModel = (modelId: string) => {
        setSettings({
            ...settings,
            models: settings.models.filter((m) => m.id !== modelId),
        });
        toast.success("Model removed!");
    };

    const toggleModelThinking = (modelId: string) => {
        setSettings({
            ...settings,
            models: settings.models.map((m) =>
                m.id === modelId ? { ...m, supportsThinking: !m.supportsThinking } : m
            ),
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-matcha"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div className="flex items-center gap-4">
                        <Link href="/profile">
                            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                                <ChevronLeft className="w-6 h-6" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Settings className="w-6 h-6 text-matcha" />
                                Settings
                            </h1>
                            <p className="text-sm text-zinc-500">Configure your AI experience</p>
                        </div>
                    </div>
                    <Button
                        onClick={saveSettings}
                        disabled={saving}
                        className="rounded-full bg-matcha hover:bg-matcha-dark text-black gap-2"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </motion.div>

                {/* System Prompt */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-4"
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-matcha" />
                        <Label className="text-lg font-semibold">System Prompt</Label>
                    </div>
                    <Textarea
                        value={settings.systemPrompt}
                        onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                        placeholder="Enter a custom system prompt to guide the AI's behavior..."
                        className="min-h-[200px] rounded-2xl bg-zinc-900/50 border-zinc-800 focus:border-matcha"
                    />
                </motion.section>

                {/* Max Tokens */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-4"
                >
                    <Label className="text-lg font-semibold">Max Token Limit</Label>
                    <div className="flex items-center gap-4">
                        <Input
                            type="number"
                            value={settings.maxTokens}
                            onChange={(e) => setSettings({ ...settings, maxTokens: parseInt(e.target.value) || 512 })}
                            min={64}
                            max={4096}
                            className="w-32 rounded-full bg-zinc-900/50 border-zinc-800 focus:border-matcha"
                        />
                        <span className="text-sm text-zinc-500">tokens (64 - 4096)</span>
                    </div>
                </motion.section>

                {/* Model Manager */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <Label className="text-lg font-semibold">Model Manager</Label>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button size="sm" className="rounded-full bg-matcha hover:bg-matcha-dark text-black gap-1">
                                    <Plus className="w-4 h-4" />
                                    Add Model
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                                <DialogHeader>
                                    <DialogTitle>Add New Model</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>Model ID</Label>
                                        <Input
                                            value={newModel.id}
                                            onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
                                            placeholder="e.g., openai/gpt-4o:free"
                                            className="rounded-full bg-zinc-800/50 border-zinc-700"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Display Name</Label>
                                        <Input
                                            value={newModel.name}
                                            onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                                            placeholder="e.g., GPT-4o"
                                            className="rounded-full bg-zinc-800/50 border-zinc-700"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>Supports Thinking</Label>
                                        <Switch
                                            checked={newModel.supportsThinking}
                                            onCheckedChange={(checked) => setNewModel({ ...newModel, supportsThinking: checked })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>Supports Image</Label>
                                        <Switch
                                            checked={newModel.supportsImage}
                                            onCheckedChange={(checked) => setNewModel({ ...newModel, supportsImage: checked })}
                                        />
                                    </div>
                                    <DialogClose asChild>
                                        <Button
                                            onClick={addModel}
                                            className="w-full rounded-full bg-matcha hover:bg-matcha-dark text-black"
                                        >
                                            Add Model
                                        </Button>
                                    </DialogClose>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-3">
                        <AnimatePresence>
                            {settings.models.map((model) => (
                                <motion.div
                                    key={model.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1">
                                            {model.supportsThinking && (
                                                <div className="p-1.5 rounded-full bg-purple-500/20" title="Supports Thinking">
                                                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                                                </div>
                                            )}
                                            {model.supportsImage && (
                                                <div className="p-1.5 rounded-full bg-blue-500/20" title="Supports Image">
                                                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{model.name}</p>
                                            <p className="text-xs text-zinc-500 truncate max-w-[200px]">{model.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {model.supportsThinking && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="rounded-full text-xs"
                                                onClick={() => toggleModelThinking(model.id)}
                                            >
                                                <Brain className={`w-4 h-4 ${model.supportsThinking ? "text-purple-400" : "text-zinc-600"}`} />
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="rounded-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="rounded-[2rem] border-zinc-800 bg-zinc-900">
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Model?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to remove {model.name}?
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => removeModel(model.id)}
                                                        className="rounded-full bg-red-500 hover:bg-red-600"
                                                    >
                                                        Remove
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </motion.section>
            </div>
        </div>
    );
}
