import { createServer } from "node:http";
import { Server } from "socket.io";

const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || "0.0.0.0";
const followPrefix = "follow@";

const httpServer = createServer((_, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      ok: true,
      service: "excalidraw-room-relay",
      port,
    }),
  );
});

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

const getRoomMembers = (roomId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  return room ? [...room] : [];
};

const emitRoomUserChange = (roomId) => {
  if (!roomId || roomId.startsWith(followPrefix)) {
    return;
  }
  io.to(roomId).emit("room-user-change", getRoomMembers(roomId));
};

const emitFollowRoomChange = (followRoomId) => {
  if (!followRoomId.startsWith(followPrefix)) {
    return;
  }
  const targetSocketId = followRoomId.slice(followPrefix.length);
  io.to(targetSocketId).emit(
    "user-follow-room-change",
    getRoomMembers(followRoomId),
  );
};

io.on("connection", (socket) => {
  socket.emit("init-room");

  socket.on("join-room", (roomId) => {
    if (typeof roomId !== "string" || !roomId) {
      return;
    }

    socket.join(roomId);

    const roomMembers = getRoomMembers(roomId);
    if (roomMembers.length === 1) {
      socket.emit("first-in-room");
    } else {
      socket.to(roomId).emit("new-user", socket.id);
    }

    emitRoomUserChange(roomId);
  });

  socket.on("server-broadcast", (roomId, encryptedBuffer, iv) => {
    if (typeof roomId !== "string" || !roomId) {
      return;
    }
    socket.to(roomId).emit("client-broadcast", encryptedBuffer, iv);
  });

  socket.on("server-volatile-broadcast", (roomId, encryptedBuffer, iv) => {
    if (typeof roomId !== "string" || !roomId) {
      return;
    }
    socket.volatile.to(roomId).emit("client-broadcast", encryptedBuffer, iv);
  });

  socket.on("user-follow", (payload) => {
    const targetSocketId = payload?.userToFollow?.socketId;
    if (typeof targetSocketId !== "string" || !targetSocketId) {
      return;
    }

    const followRoomId = `${followPrefix}${targetSocketId}`;
    if (payload?.action === "FOLLOW") {
      socket.join(followRoomId);
    } else {
      socket.leave(followRoomId);
    }

    emitFollowRoomChange(followRoomId);
  });

  socket.on("disconnecting", () => {
    const joinedRooms = [...socket.rooms].filter((roomId) => roomId !== socket.id);
    queueMicrotask(() => {
      for (const roomId of joinedRooms) {
        if (roomId.startsWith(followPrefix)) {
          emitFollowRoomChange(roomId);
        } else {
          emitRoomUserChange(roomId);
        }
      }
    });
  });
});

httpServer.listen(port, host, () => {
  console.log(`excalidraw-room-relay listening on http://${host}:${port}`);
});