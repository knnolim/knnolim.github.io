import {
  createApp,
  ref,
  computed,
  nextTick,
  watch,
  onMounted,
  defineComponent,
} from "vue";

import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const CHAT_DIRECTORY_CHANNEL = "group-chats-directory";

  const newChatTitle = ref("");
  const myMessage = ref("");
  const actorToAdd = ref("");
  const statusMessage = ref("");

  const isPresetMenuOpen = ref(false);
  const isPresetEditorOpen = ref(false);
  const isEditingPresets = ref(false);
  const editingPresetIndex = ref(null);

  const presetEmoji = ref("");
  const presetMessage = ref("");
  const presets = ref([]);

  const currentPath = ref("/home");
  const activeChatChannel = ref(null);

  const urlUsername = ref("");
  const isFinishingLogin = ref(false);

  const localChatObjects = ref([]);
  const localMessageObjects = ref([]);
  const localAddObjects = ref([]);

  function clearChatInputs() {
    myMessage.value = "";
    actorToAdd.value = "";
  }

  function readRouteFromUrl() {
    const url = new URL(window.location.href);

    urlUsername.value = url.searchParams.get("username") || "";

    const page = url.searchParams.get("page") || "home";
    const chatId = url.searchParams.get("chatId");

    if (!url.searchParams.has("page")) {
      url.searchParams.set("page", page);
      window.history.replaceState({}, "", url);
    }

    if (page === "chat" && chatId) {
      currentPath.value = `/chat/${chatId}`;
      activeChatChannel.value = chatId;
      return;
    }

    if (page === "login") {
      currentPath.value = "/login";
      activeChatChannel.value = null;
      return;
    }

    currentPath.value = "/home";
    activeChatChannel.value = null;
  }

  function navigateToPage(page, chatId = null) {
    const url = new URL(window.location.href);

    url.searchParams.set("page", page);

    if (chatId) {
      url.searchParams.set("chatId", chatId);
    } else {
      url.searchParams.delete("chatId");
    }

    window.history.pushState({}, "", url);

    clearChatInputs();
    statusMessage.value = "";
    readRouteFromUrl();
    nextTick(scrollToBottom);
  }

  readRouteFromUrl();

  window.addEventListener("popstate", () => {
    clearChatInputs();
    statusMessage.value = "";
    readRouteFromUrl();
    nextTick(scrollToBottom);
  });

  const isLoggedIn = computed(() => {
    return Boolean(session.value);
  });

  const activeActor = computed(() => {
    return session.value?.actor || "";
  });

  const currentRoute = computed(() => {
    if (currentPath.value === "/home") return "home";
    if (currentPath.value === "/login") return "login";
    if (currentPath.value.startsWith("/chat/")) return "chat";
    return "not-found";
  });

  function goHome() {
    navigateToPage("home");
  }

  function goLogin() {
    navigateToPage("login");
  }

  async function maybeFinishLoginFromUsername() {
    readRouteFromUrl();

    if (session.value) return false;
    if (!urlUsername.value) return false;
    if (isFinishingLogin.value) return true;

    isFinishingLogin.value = true;
    statusMessage.value = `Finishing login as ${urlUsername.value}...`;

    try {
      const username = urlUsername.value.trim();

      const actor = username.startsWith("did:")
        ? username
        : await graffiti.handleToActor(username);

      if (!actor) {
        throw new Error("No actor found for username");
      }

      const url = new URL(window.location.href);

      url.searchParams.delete("username");
      url.searchParams.set("actor", actor);

      if (!url.searchParams.has("page")) {
        url.searchParams.set("page", "home");
      }

      window.location.replace(url.toString());
      return true;
    } catch (error) {
      console.error(error);
      isFinishingLogin.value = false;
      statusMessage.value =
        "Could not finish login automatically. Try logging in again.";
      return false;
    }
  }

  async function logIn() {
    statusMessage.value = "";

    try {
      await graffiti.login();

      readRouteFromUrl();
      await maybeFinishLoginFromUsername();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Login did not finish. Please try again.";
    }
  }

  async function logOut() {
    if (!session.value) return;

    statusMessage.value = "";

    try {
      await graffiti.logout(session.value);

      const url = new URL(window.location.href);
      url.searchParams.delete("username");
      url.searchParams.delete("actor");
      window.history.replaceState({}, "", url);

      urlUsername.value = "";
      statusMessage.value = "You are now logged out.";
    } catch (error) {
      console.error(error);
      statusMessage.value = "Logout failed. Please try again.";
    }
  }

  async function requireLogin(message) {
    readRouteFromUrl();

    if (session.value === undefined || isFinishingLogin.value) {
      statusMessage.value =
        "Still checking your login status. Try again in a moment.";
      return false;
    }

    if (!session.value) {
      statusMessage.value = message || "Please log in with Graffiti first.";
      navigateToPage("login");
      return false;
    }

    return true;
  }

  const {
    objects: chatObjects,
    isFirstPoll: areChatsLoading,
    poll: pollChats,
  } = useGraffitiDiscover(
    () => [CHAT_DIRECTORY_CHANNEL],
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "title",
            "channel",
            "members",
            "published",
          ],
          properties: {
            activity: { const: "Create" },
            type: { const: "Chat" },
            title: { type: "string" },
            channel: { type: "string" },
            members: {
              type: "array",
              items: { type: "string" },
            },
            published: { type: "number" },
          },
        },
      },
    },
    undefined,
    false
  );

  const {
    objects: messageObjects,
    isFirstPoll: areMessageObjectsLoading,
    poll: pollMessages,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "content",
            "chatChannel",
            "published",
          ],
          properties: {
            activity: { const: "Send" },
            type: { const: "Message" },
            content: { type: "string" },
            chatChannel: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    undefined,
    true
  );

  const {
    objects: addObjects,
    poll: pollAdds,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: ["activity", "type", "object", "target", "published"],
          properties: {
            activity: { const: "Add" },
            type: { const: "Member" },
            object: { type: "string" },
            target: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    undefined,
    false
  );

  function dedupeByUrl(objects) {
    const seen = new Set();

    return objects.filter((object) => {
      if (seen.has(object.url)) return false;
      seen.add(object.url);
      return true;
    });
  }

  const allChatObjects = computed(() => {
    return dedupeByUrl([...localChatObjects.value, ...chatObjects.value]);
  });

  const allMessageObjects = computed(() => {
    return dedupeByUrl([...localMessageObjects.value, ...messageObjects.value]);
  });

  const allAddObjects = computed(() => {
    return dedupeByUrl([...localAddObjects.value, ...addObjects.value]);
  });

  const visibleMessageObjects = computed(() => {
    return allMessageObjects.value.filter((message) => {
      return message.value.chatChannel === activeChatChannel.value;
    });
  });

  const visibleAddObjects = computed(() => {
    return allAddObjects.value.filter((addObj) => {
      return addObj.value.target === activeChatChannel.value;
    });
  });

  const sortedChats = computed(() => {
    return [...allChatObjects.value].sort((a, b) => {
      return b.value.published - a.value.published;
    });
  });

  const sortedMessageObjects = computed(() => {
    return [...visibleMessageObjects.value].sort((a, b) => {
      return a.value.published - b.value.published;
    });
  });

  const activeChat = computed(() => {
    return allChatObjects.value.find((chat) => {
      return chat.value.channel === activeChatChannel.value;
    });
  });

  const activeChatMembers = computed(() => {
    const chat = activeChat.value;
    if (!chat) return [];

    const members = new Set(chat.value.members || []);

    for (const addObj of visibleAddObjects.value) {
      members.add(addObj.value.object);
    }

    return [...members];
  });

  async function newChat() {
    if (!(await requireLogin("Please log in before creating a chat."))) return;
    if (!newChatTitle.value.trim()) return;

    const creator = session.value.actor;
    const newChannel = crypto.randomUUID();
    const title = newChatTitle.value.trim();

    statusMessage.value = "Creating chat...";

    try {
      const createdChat = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title,
            channel: newChannel,
            members: [creator],
            published: Date.now(),
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
        },
        session.value
      );

      localChatObjects.value.push(createdChat);
      newChatTitle.value = "";
      statusMessage.value = "";

      await pollChats();

      navigateToPage("chat", newChannel);
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not create the chat. Try logging in again.";
    }
  }

  function openChat(chat) {
    navigateToPage("chat", chat.value.channel);
  }

  function closeChat() {
    goHome();
  }

  const isSending = ref(false);

  async function postChatMessage(content, loginMessage) {
    if (!(await requireLogin(loginMessage))) return false;
    if (!activeChat.value) return false;
    if (!content.trim()) return false;

    isSending.value = true;
    statusMessage.value = "";

    try {
      const createdMessage = await graffiti.post(
        {
          value: {
            activity: "Send",
            type: "Message",
            content: content.trim(),
            chatChannel: activeChat.value.value.channel,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
        },
        session.value
      );

      localMessageObjects.value.push(createdMessage);

      await pollMessages();
      nextTick(scrollToBottom);

      return true;
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not send the message. Try logging in again.";
      return false;
    } finally {
      isSending.value = false;
    }
  }

  async function sendMessage() {
    const content = myMessage.value.trim();
    if (!content) return;

    myMessage.value = "";

    const sent = await postChatMessage(
      content,
      "Please log in before sending a message."
    );

    if (!sent) {
      myMessage.value = content;
    }
  }

  async function sendPreset(preset) {
    if (!preset) return;

    const content = `${preset.emoji} ${preset.message}`.trim();

    const sent = await postChatMessage(
      content,
      "Please log in before sending a preset."
    );

    if (sent) {
      closePresetMenu();
    }
  }

  function getPresetStorageKey() {
    const actor = session.value?.actor || "guest";
    return `muddy-chat-presets:${actor}`;
  }

  function loadPresets() {
    try {
      const rawPresets = localStorage.getItem(getPresetStorageKey());

      if (!rawPresets) {
        presets.value = [];
        return;
      }

      const parsedPresets = JSON.parse(rawPresets);

      presets.value = Array.isArray(parsedPresets)
        ? parsedPresets.filter((preset) => {
            return preset && preset.id && preset.emoji && preset.message;
          })
        : [];
    } catch (error) {
      console.error(error);
      presets.value = [];
    }
  }

  function savePresetsToStorage() {
    localStorage.setItem(getPresetStorageKey(), JSON.stringify(presets.value));
  }

  function togglePresetMenu() {
    isPresetMenuOpen.value = !isPresetMenuOpen.value;

    if (!isPresetMenuOpen.value) {
      closePresetEditor();
      isEditingPresets.value = false;
    }
  }

  function closePresetMenu() {
    isPresetMenuOpen.value = false;
    isEditingPresets.value = false;
    closePresetEditor();
  }

  function togglePresetEditMode() {
    isEditingPresets.value = !isEditingPresets.value;
  }

  function openNewPresetEditor() {
    editingPresetIndex.value = null;
    presetEmoji.value = "";
    presetMessage.value = "";
    statusMessage.value = "";
    isPresetEditorOpen.value = true;
  }

  function openPresetEditor(index) {
    const preset = presets.value[index];
    if (!preset) return;

    editingPresetIndex.value = index;
    presetEmoji.value = preset.emoji;
    presetMessage.value = preset.message;
    statusMessage.value = "";
    isPresetEditorOpen.value = true;
  }

  function closePresetEditor() {
    isPresetEditorOpen.value = false;
    editingPresetIndex.value = null;
    presetEmoji.value = "";
    presetMessage.value = "";
  }

  function savePreset() {
    const emoji = presetEmoji.value.trim();
    const message = presetMessage.value.trim();

    if (!emoji || !message) {
      statusMessage.value = "Please enter both an emoji and a preset message.";
      return;
    }

    const existingPreset =
      editingPresetIndex.value === null
        ? null
        : presets.value[editingPresetIndex.value];

    const savedPreset = {
      id: existingPreset?.id || crypto.randomUUID(),
      emoji,
      message,
    };

    if (editingPresetIndex.value === null) {
      presets.value = [...presets.value, savedPreset];
    } else {
      presets.value = presets.value.map((preset, index) => {
        return index === editingPresetIndex.value ? savedPreset : preset;
      });
    }

    savePresetsToStorage();
    statusMessage.value = "";
    closePresetEditor();
  }

  function deletePreset() {
    if (editingPresetIndex.value === null) return;

    presets.value = presets.value.filter((_, index) => {
      return index !== editingPresetIndex.value;
    });

    savePresetsToStorage();
    statusMessage.value = "";
    closePresetEditor();
  }
  async function addToChat() {
    if (!(await requireLogin("Please log in before adding someone to a chat.")))
      return;

    if (!activeChat.value) return;
    if (!actorToAdd.value.trim()) return;

    const personToAdd = actorToAdd.value.trim();

    statusMessage.value = "Adding person...";

    try {
      const createdAdd = await graffiti.post(
        {
          value: {
            activity: "Add",
            type: "Member",
            object: personToAdd,
            target: activeChat.value.value.channel,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
        },
        session.value
      );

      localAddObjects.value.push(createdAdd);
      actorToAdd.value = "";
      statusMessage.value = "";

      await pollAdds();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not add that person. Try logging in again.";
    }
  }

  function isOwnMessage(message) {
    return message.actor === activeActor.value;
  }

  function scrollToBottom() {
    const scroller = document.querySelector(".messages");

    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  const isDeleting = ref(new Set());

  async function deleteMessage(message) {
    if (!(await requireLogin("Please log in before deleting a message.")))
      return;

    isDeleting.value.add(message.url);

    try {
      await graffiti.delete(message, session.value);

      localMessageObjects.value = localMessageObjects.value.filter((object) => {
        return object.url !== message.url;
      });

      await pollMessages();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not delete this message.";
    } finally {
      isDeleting.value.delete(message.url);
    }
  }

  watch(activeChatChannel, async () => {
    clearChatInputs();
    statusMessage.value = "";

    if (activeChatChannel.value) {
      await pollMessages();
      await pollAdds();
    }

    nextTick(scrollToBottom);
  });

  watch(session, () => {
    readRouteFromUrl();
    loadPresets();
    statusMessage.value = "";
  });

  onMounted(async () => {
    readRouteFromUrl();
    loadPresets();

    const redirectingToFinishLogin = await maybeFinishLoginFromUsername();
    if (redirectingToFinishLogin) return;

    await pollChats();

    if (activeChatChannel.value) {
      await pollMessages();
      await pollAdds();
    }
  });

  return {
    session,
    isLoggedIn,
    activeActor,
    urlUsername,
    isFinishingLogin,

    currentPath,
    currentRoute,

    newChatTitle,
    myMessage,
    actorToAdd,
    statusMessage,
    activeChatChannel,

    chatObjects: allChatObjects,
    sortedChats,
    areChatsLoading,
    messageObjects: visibleMessageObjects,
    sortedMessageObjects,
    areMessageObjectsLoading,
    activeChat,
    activeChatMembers,

    logIn,
    logOut,
    newChat,
    openChat,
    closeChat,
    goHome,
    goLogin,
    sendMessage,
    addToChat,
    deleteMessage,
    isOwnMessage,

    isSending,
    isDeleting,

    getPresetStorageKey,
    loadPresets,
    savePresetsToStorage,
    togglePresetMenu,
    closePresetMenu,
    togglePresetEditMode,
    openNewPresetEditor,
    openPresetEditor,
    closePresetEditor,
    savePreset,
    deletePreset,
    sendPreset,

    isPresetMenuOpen,
    isPresetEditorOpen,
    isEditingPresets,
    editingPresetIndex,
    presetEmoji,
    presetMessage,
    presets,
  };
}

const MessageBubble = defineComponent({
  name: "MessageBubble",
  template: "#message-bubble-template",
  props: {
    message: {
      type: Object,
      required: true,
    },
    own: {
      type: Boolean,
      default: false,
    },
    deleting: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["delete-message"],
  setup(props) {
    const formattedTime = computed(() => {
      const timestamp = props.message?.value?.published;
      if (!timestamp) return "";

      const date = new Date(timestamp);

      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    });

    return {
      formattedTime,
    };
  },
});

const ChatCard = defineComponent({
  name: "ChatCard",
  template: "#chat-card-template",
  props: {
    chat: {
      type: Object,
      required: true,
    },
    showImage: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["open-chat"],
});

const App = {
  template: "#template",
  components: {
    MessageBubble,
    ChatCard,
  },
  setup,
};

createApp(App)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");