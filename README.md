# Campus Quest

An incentive-based task allocation and completion platform for IITJ students.

## Features

- **User Authentication**: Secure sign-up/sign-in with IITJ email verification
- **Task Management**: Post and apply for tasks with real-time updates
- **Notifications**: Real-time notifications for task applications
- **Responsive Design**: Mobile-friendly interface
- **Real-time Updates**: Live task updates using Firebase Firestore

## Security Features

- Email verification required for account activation
- IITJ email domain restriction for sign-ups
- XSS protection through HTML escaping
- Input validation and sanitization
- Firebase security rules (should be configured in Firebase Console)

## Setup Instructions

1. **Firebase Configuration**: 
   - The Firebase configuration is in `firebase-config.js`
   - Ensure your Firebase project has proper security rules configured
   - Set up authorized domains in Firebase Console

2. **Security Rules** (Configure in Firebase Console):
   ```javascript
   // Firestore Security Rules
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Users can only read/write their own data
       match /tasks/{taskId} {
         allow read: if request.auth != null;
         allow create: if request.auth != null && 
                       request.auth.token.email.matches('.*@iitj\\.ac\\.in$');
         allow update: if request.auth != null && 
                       (resource.data.creator == request.auth.token.email ||
                        request.auth.token.email in resource.data.applicants);
       }
       
       match /notifications/{notificationId} {
         allow read, write: if request.auth != null && 
                           resource.data.user == request.auth.token.email;
       }
     }
   }
   ```

3. **Run the Application**:
   - Open `index.html` in a web browser
   - Or serve it using a local web server

## Recent Improvements

### Error Handling & User Experience
- ✅ Comprehensive error handling for all Firebase operations
- ✅ Loading states for better user feedback
- ✅ Success/error message notifications
- ✅ Input validation with character limits
- ✅ Real-time character counting

### UI/UX Enhancements
- ✅ Improved responsive design for mobile devices
- ✅ Enhanced notification panel
- ✅ Better task card layout with applicant count
- ✅ Visual feedback for applied tasks
- ✅ Loading animations and transitions

### Performance Optimizations
- ✅ Debounced character counting
- ✅ Proper cleanup of Firebase listeners
- ✅ Optimized DOM updates
- ✅ Memory leak prevention

### Security Improvements
- ✅ HTML escaping to prevent XSS
- ✅ Input sanitization
- ✅ Firebase configuration separation
- ✅ Enhanced authentication error handling

## File Structure

```
├── index.html          # Main HTML file
├── script.js           # JavaScript application logic
├── style.css           # CSS styling
├── firebase-config.js  # Firebase configuration
└── README.md          # This file
```

## Browser Compatibility

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge (latest versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Development Notes

- Uses Firebase v10.7.1
- ES6 modules for code organization
- CSS Grid and Flexbox for responsive layout
- No external dependencies beyond Firebase

## Security Recommendations

1. **Configure Firebase Security Rules** as shown above
2. **Set up authorized domains** in Firebase Console
3. **Enable App Check** for additional protection
4. **Monitor usage** through Firebase Analytics
5. **Regular security audits** of Firestore rules
6. **Use HTTPS** in production environments

## Contributing

1. Follow the existing code style
2. Test on multiple browsers and devices
3. Ensure all security measures are maintained
4. Update documentation for new features

## License

This project is for educational purposes at IITJ.
