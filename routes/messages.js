var express = require("express");
var router = express.Router();
let messageModel = require("../schemas/messages");
let { CheckLogin } = require('../utils/authHandler');
let { uploadMessage } = require('../utils/uploadHandler');

// GET all messages between current user and userID
router.get("/:userID", CheckLogin, async function (req, res) {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userID;

    let messages = await messageModel
      .find({
        isDeleted: false,
        $or: [
          { from: currentUserId, to: targetUserId },
          { from: targetUserId, to: currentUserId }
        ]
      })
      .populate({
        path: 'from',
        select: 'username fullName avatarUrl'
      })
      .populate({
        path: 'to',
        select: 'username fullName avatarUrl'
      })
      .sort({ createdAt: 1 });

    res.send(messages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// POST new message - support both text (JSON) and file (form-data)
router.post("/", CheckLogin, uploadMessage.single('file'), async function (req, res) {
  try {
    const currentUserId = req.user._id;
    const { to, message } = req.body;

    // Validate input
    if (!to) {
      return res.status(400).send({ 
        message: "Missing required field: to" 
      });
    }

    let messageType = "text";
    let messageText = message || "";

    // If file is uploaded
    if (req.file) {
      messageType = "file";
      messageText = req.file.path;
    } else if (!message) {
      return res.status(400).send({ 
        message: "Either message text or file must be provided" 
      });
    }

    let newMessage = new messageModel({
      from: currentUserId,
      to: to,
      messageContent: {
        type: messageType,
        text: messageText
      }
    });

    let savedMessage = await newMessage.save();
    
    // Populate references
    let populatedMessage = await messageModel.findById(savedMessage._id)
      .populate({
        path: 'from',
        select: 'username fullName avatarUrl'
      })
      .populate({
        path: 'to',
        select: 'username fullName avatarUrl'
      });

    res.status(201).send(populatedMessage);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// GET last message for each conversation
router.get("/", CheckLogin, async function (req, res) {
  try {
    const currentUserId = req.user._id;

    // Get all messages with populated user details
    let messages = await messageModel
      .find({
        isDeleted: false,
        $or: [
          { from: currentUserId },
          { to: currentUserId }
        ]
      })
      .populate('from', 'username fullName avatarUrl')
      .populate('to', 'username fullName avatarUrl')
      .sort({ createdAt: -1 });

    // Group by conversation - keep last message of each user
    let conversationMap = new Map();
    messages.forEach(msg => {
      const otherUserId = msg.from._id.toString() === currentUserId.toString() 
        ? msg.to._id 
        : msg.from._id;
      const key = otherUserId.toString();
      
      if (!conversationMap.has(key)) {
        conversationMap.set(key, msg);
      }
    });

    let result = Array.from(conversationMap.values());
    res.send(result);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
