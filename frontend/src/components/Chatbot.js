import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  IconButton,
  TextField,
  Typography,
  Avatar,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import axios from 'axios';

// Chatbot component
const Chatbot = () => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      text: "Hey! I’m Smartie, your personal MadeWithNestlé assistant. Ask me anything, and I’ll quickly search the entire site to find the answers you need!",
      sender: 'bot'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Connect to backend API
  const API_URL = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001/api/chat'
    : '/api/chat';

  // Open and close chatbot
  const handleClickOpen = () => {
    setOpen(true);
    setExpanded(true);
  };

  const handleClose = () => {
    setOpen(false);
    setExpanded(false);
  };

  // Handles sending messages
  const handleSend = async () => {
    if (input.trim() === '') return;

    const userMessage = { text: input, sender: 'user' };
    // Add user's message to the chat
    setMessages(prev => [...prev, userMessage]);
    // Clear input field
    setInput('');

    try {
      setIsLoading(true);
      // Send message to the API
      const response = await axios.post(API_URL, { message: input }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      setMessages(prev => [...prev, {
        text: response.data.response,
        sender: 'bot'
      }]);
    } catch (error) {
      // If the API call fails, show an error message
      console.error('API error:', error.response?.data || error.message);
      setMessages(prev => [...prev, {
        text: error.response?.data?.error ||
              "Sorry, I'm having trouble connecting. Please try again later.",
        sender: 'bot'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Enter key press to send the message
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handles scrolling
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'
    }}>
      {!expanded && (
        <IconButton
          onClick={handleClickOpen}
          sx={{
            backgroundColor: '#002b5c',
            color: 'white',
            width: 60,
            height: 60,
            '&:hover': {
              backgroundColor: '#001f3f'
            }
          }}
        >
          <img
            src="/chatbot-icon.png"
            alt="Chatbot"
            style={{ width: 30, height: 30 }}
          />
        </IconButton>
      )}

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 20,
            right: 20,
            margin: 0,
            height: '70vh',
            maxHeight: '600px',
            width: '400px',
            borderRadius: '10px',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{
          backgroundColor: '#002b5c',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: 'white', mr: 2, width: 40, height: 40 }}>
              <img
                src="/chatbot-icon.png"
                alt="Chatbot Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
              />
            </Avatar>
            <Typography variant="h6">Smartie</Typography>
          </Box>
          <IconButton onClick={handleClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{
          padding: 0,
          backgroundColor: '#f5f5f5',
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}>
          <Box sx={{
            flexGrow: 1,
            overflowY: 'auto',
            p: 2
          }}>
            <List>
              {messages.map((message, index) => (
                <ListItem
                  key={index}
                  sx={{
                    display: 'flex',
                    flexDirection: message.sender === 'user' ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    px: 1
                  }}
                >
                  <ListItemAvatar sx={{ alignSelf: 'flex-end', mb: '4px' }}>
                    <Avatar sx={{ bgcolor: '#002b5c', width: 36, height: 36 }}>
                      {message.sender === 'user'
                        ? <PersonOutlineIcon sx={{ color: 'white' }} />
                        : (
                          <img
                            src="/chatbot-icon.png"
                            alt="Bot"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                          />
                        )
                      }
                    </Avatar>
                  </ListItemAvatar>

                  <ListItemText
                    primary={
                      <Paper
                        elevation={3}
                        sx={{
                          p: 2,
                          backgroundColor: message.sender === 'user' ? '#002b5c' : 'white',
                          color: message.sender === 'user' ? 'white' : 'black',
                          borderRadius: message.sender === 'user'
                            ? '18px 18px 0 18px'
                            : '18px 18px 18px 0',
                          maxWidth: '85%',
                          wordWrap: 'break-word',
                          fontSize: '0.95rem'
                        }}
                      >
                        {message.text}
                      </Paper>
                    }
                    sx={{
                      ml: message.sender === 'bot' ? 1 : 0,
                      mr: message.sender === 'user' ? 1 : 0
                    }}
                  />
                </ListItem>
              ))}
              {isLoading && (
                <ListItem sx={{ display: 'flex', alignItems: 'flex-end' }}>
                  <ListItemAvatar sx={{ alignSelf: 'flex-end', mb: '4px' }}>
                    <Avatar sx={{ bgcolor: '#002b5c', width: 36, height: 36 }}>
                      <img
                        src="/chatbot-icon.png"
                        alt="Bot"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                      />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Paper elevation={3} sx={{ p: 2, borderRadius: '18px 18px 18px 0' }}>
                        <CircularProgress size={20} />
                      </Paper>
                    }
                  />
                </ListItem>
              )}
              <div ref={messagesEndRef} />
            </List>
          </Box>

          <Box sx={{
            p: 2,
            borderTop: '1px solid #ccc',
            backgroundColor: 'white'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <TextField
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question..."
                onKeyPress={handleKeyPress}
                sx={{ mr: 1 }}
                disabled={isLoading}
              />
              <IconButton
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                sx={{
                  backgroundColor: '#002b5c',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#001f3f'
                  },
                  '&:disabled': {
                    backgroundColor: '#cccccc'
                  }
                }}
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : <SendIcon />}
              </IconButton>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Chatbot;
