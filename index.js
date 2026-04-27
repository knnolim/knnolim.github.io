import { createApp, ref, computed, nextTick } from "vue";
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

  const activeChatChannel = ref(null);

  const { objects: chatObjects, isFirstPoll: areChatsLoading } =
    useGraffitiDiscover(
      () => [CHAT_DIRECTORY_CHANNEL],
      {
        properties: {
          value: {
            required: ["activity", "type", "title", "channel", "members", "published"],
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
      true
    );

  const { objects: messageObjects, isFirstPoll: areMessageObjectsLoading } =
    useGraffitiDiscover(
      () => (activeChatChannel.value ? [activeChatChannel.value] : []),
      {
        properties: {
          value: {
            required: ["activity", "type", "content", "chatChannel", "published"],
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

  const { objects: addObjects } = useGraffitiDiscover(
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
    true
  );

  // Sort chats newest first
  const sortedChats = computed(() => {
    return chatObjects.value.toSorted((a, b) => {
      return b.value.published - a.value.published;
    });
  });

  // Sort messages oldest first (usually nicer for chats)
  const sortedMessageObjects = computed(() => {
    return messageObjects.value.toSorted((a, b) => {
      return a.value.published - b.value.published;
    });
  });

  // Find the active chat object from the selected channel
  const activeChat = computed(() => {
    return chatObjects.value.find(
      (chat) => chat.value.channel === activeChatChannel.value
    );
  });

  // Compute current members = original members from Create Chat
  // plus anyone added later with Add Member events
  const activeChatMembers = computed(() => {
    const chat = activeChat.value;
    if (!chat) return [];

    const members = new Set(chat.value.members || []);

    for (const addObj of addObjects.value) {
      if (addObj.value.target === chat.value.channel) {
        members.add(addObj.value.object);
      }
    }

    return [...members];
  });

  // Create a new group chat
  async function newChat() {
    if (!session.value) return;
    if (!newChatTitle.value.trim()) return;

    const creator = session.value.actor;
    const newChannel = crypto.randomUUID();

    await graffiti.post(
      {
        value: {
          activity: "Create",
          type: "Chat",
          title: newChatTitle.value.trim(),
          channel: newChannel,
          members: [creator],
          published: Date.now(),
        },
        channels: [CHAT_DIRECTORY_CHANNEL],

        // private group chat initially with just creator
        // allowed: [creator],
      },
      session.value
    );

    activeChatChannel.value = newChannel;
    newChatTitle.value = "";
  }

  // Open a chat from the list
  function openChat(chat) {
    activeChatChannel.value = chat.value.channel;
    nextTick(scrollToBottom);
  }

  function closeChat() {
    activeChatChannel.value = null;
  }

  const isSending = ref(false);
  async function sendMessage() {
    if (!session.value) return;
    if (!activeChat.value) return;
    if (!myMessage.value.trim()) return;

    isSending.value = true;
    try {
        await graffiti.post(
        {
            value: {
            activity: "Send",
            type: "Message",
            content: myMessage.value.trim(),
            chatChannel: activeChat.value.value.channel,
            published: Date.now(),
            },
            channels: [activeChat.value.value.channel],
        },
        session.value
        );

        myMessage.value = "";
        nextTick(scrollToBottom);
    } finally {
        isSending.value = false;
    }
    }

  function isOwnMessage(message) {
    return message.actor === session.value?.actor;
  }

  function scrollToBottom() {
    const scroller = document.querySelector(".messages");
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  // Add someone to the current group chat
  async function addToChat() {
    if (!session.value) return;
    if (!activeChat.value) return;
    if (!actorToAdd.value.trim()) return;

    const personToAdd = actorToAdd.value.trim();

    await graffiti.post(
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

    actorToAdd.value = "";
    }

  const isDeleting = ref(new Set());
  async function deleteMessage(message) {
    isDeleting.value.add(message.url);
    try {
      await graffiti.delete(message, session.value);
    } finally {
      isDeleting.value.delete(message.url);
    }
  }

  return {
    // UI state
    newChatTitle,
    myMessage,
    actorToAdd,
    activeChatChannel,

    // discovered data
    chatObjects,
    sortedChats,
    areChatsLoading,
    messageObjects,
    sortedMessageObjects,
    areMessageObjectsLoading,
    activeChat,
    activeChatMembers,

    // actions
    newChat,
    openChat,
    closeChat,
    sendMessage,
    addToChat,
    deleteMessage,
    isOwnMessage,

    // loading state
    isSending,
    isDeleting,
  };
}

const App = { template: "#template", setup };

createApp(App)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");