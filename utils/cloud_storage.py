"""
Cloud Storage Integration Module for Flight Data Visualization.

This module provides functionality to interact with Google Drive and Microsoft OneDrive,
allowing users to import large dataset files directly from cloud storage.
"""

import os
import json
import tempfile
import logging
from typing import Dict, List, Optional, Tuple, Any

import requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import msal

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
ONEDRIVE_SCOPES = ['Files.Read']

# OAuth 2.0 client secrets file paths (populated from environment variables at runtime)
GOOGLE_CREDENTIALS_PATH = 'client_secrets/google_client_secret.json'
MICROSOFT_CREDENTIALS_PATH = 'client_secrets/ms_client_secret.json'

class CloudStorageService:
    """Base class for cloud storage integration."""
    
    def __init__(self):
        self.authenticated = False
        
    def authenticate(self) -> bool:
        """Authenticate with the cloud service."""
        raise NotImplementedError("Subclasses must implement authenticate()")
        
    def list_files(self, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List files in the user's cloud storage, optionally within a specific folder."""
        raise NotImplementedError("Subclasses must implement list_files()")
    
    def download_file(self, file_id: str) -> Tuple[str, str]:
        """Download a file from cloud storage.
        
        Returns:
            Tuple containing (temporary file path, original filename)
        """
        raise NotImplementedError("Subclasses must implement download_file()")


class GoogleDriveService(CloudStorageService):
    """Google Drive integration."""
    
    def __init__(self):
        super().__init__()
        self.credentials = None
        self.service = None
        
        # Create credentials directory if it doesn't exist
        os.makedirs('client_secrets', exist_ok=True)
    
    def authenticate(self) -> bool:
        """Authenticate with Google Drive.
        
        Returns:
            bool: True if authentication is successful, False otherwise.
        """
        try:
            # Check if we already have valid credentials
            if os.path.exists('client_secrets/google_token.json'):
                with open('client_secrets/google_token.json', 'r') as token_file:
                    token_data = json.load(token_file)
                    self.credentials = Credentials.from_authorized_user_info(token_data)
            
            # If no valid credentials, start OAuth flow
            if not self.credentials or not self.credentials.valid:
                if os.path.exists(GOOGLE_CREDENTIALS_PATH):
                    flow = Flow.from_client_secrets_file(
                        GOOGLE_CREDENTIALS_PATH,
                        scopes=GOOGLE_DRIVE_SCOPES,
                        redirect_uri='urn:ietf:wg:oauth:2.0:oob'
                    )
                    
                    auth_url, _ = flow.authorization_url(prompt='consent')
                    
                    # Return auth URL for frontend to open
                    logger.info(f"Google Drive auth URL: {auth_url}")
                    return {
                        'auth_url': auth_url,
                        'provider': 'google',
                        'requires_auth': True
                    }
                else:
                    logger.error(f"Google credentials file not found at {GOOGLE_CREDENTIALS_PATH}")
                    return {
                        'error': 'Google Drive credentials file not found',
                        'provider': 'google',
                        'requires_auth': True
                    }
            
            # Build the Drive service
            self.service = build('drive', 'v3', credentials=self.credentials)
            self.authenticated = True
            
            return {
                'authenticated': True,
                'provider': 'google'
            }
            
        except Exception as e:
            logger.error(f"Error authenticating with Google Drive: {str(e)}")
            return {
                'error': f"Failed to authenticate with Google Drive: {str(e)}",
                'provider': 'google',
                'requires_auth': True
            }
    
    def exchange_auth_code(self, auth_code: str) -> Dict[str, Any]:
        """Exchange authorization code for access token.
        
        Args:
            auth_code: The authorization code from Google OAuth flow
            
        Returns:
            Dict with authentication result
        """
        try:
            flow = Flow.from_client_secrets_file(
                GOOGLE_CREDENTIALS_PATH,
                scopes=GOOGLE_DRIVE_SCOPES,
                redirect_uri='urn:ietf:wg:oauth:2.0:oob'
            )
            
            flow.fetch_token(code=auth_code)
            self.credentials = flow.credentials
            
            # Save credentials for future use
            with open('client_secrets/google_token.json', 'w') as token_file:
                token_data = {
                    'token': self.credentials.token,
                    'refresh_token': self.credentials.refresh_token,
                    'token_uri': self.credentials.token_uri,
                    'client_id': self.credentials.client_id,
                    'client_secret': self.credentials.client_secret,
                    'scopes': self.credentials.scopes
                }
                json.dump(token_data, token_file)
            
            # Build the Drive service
            self.service = build('drive', 'v3', credentials=self.credentials)
            self.authenticated = True
            
            return {
                'authenticated': True,
                'provider': 'google'
            }
            
        except Exception as e:
            logger.error(f"Error exchanging auth code with Google Drive: {str(e)}")
            return {
                'error': f"Failed to authenticate with Google Drive: {str(e)}",
                'provider': 'google',
                'requires_auth': True
            }
    
    def list_files(self, folder_id: Optional[str] = None, file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """List files in Google Drive, optionally filtered by folder and file types.
        
        Args:
            folder_id: Optional folder ID to list contents of
            file_types: Optional list of file extensions to filter by (e.g., ['csv', 'txt'])
            
        Returns:
            List of file metadata dictionaries
        """
        if not self.authenticated or not self.service:
            raise ValueError("Not authenticated with Google Drive")
        
        try:
            # Prepare query to filter by file types and folder
            query_parts = []
            
            # Filter by MIME types for specified file extensions
            if file_types:
                mime_type_queries = []
                for ext in file_types:
                    if ext.lower() == 'csv':
                        mime_type_queries.append("mimeType='text/csv'")
                    elif ext.lower() == 'txt':
                        mime_type_queries.append("mimeType='text/plain'")
                
                if mime_type_queries:
                    query_parts.append(f"({' or '.join(mime_type_queries)})")
            
            # Filter by folder ID if provided
            if folder_id:
                query_parts.append(f"'{folder_id}' in parents")
            else:
                query_parts.append("'root' in parents")
            
            # Combine all query parts
            query = " and ".join(query_parts)
            
            # Execute the query
            results = self.service.files().list(
                q=query,
                pageSize=100,
                fields="files(id, name, mimeType, size, modifiedTime)"
            ).execute()
            
            files = results.get('files', [])
            
            # Format the results for our API
            formatted_files = []
            for file in files:
                formatted_files.append({
                    'id': file['id'],
                    'name': file['name'],
                    'mime_type': file['mimeType'],
                    'size': file.get('size', '0'),
                    'modified_time': file['modifiedTime'],
                    'provider': 'google'
                })
            
            return formatted_files
            
        except Exception as e:
            logger.error(f"Error listing files in Google Drive: {str(e)}")
            raise ValueError(f"Failed to list files in Google Drive: {str(e)}")
    
    def download_file(self, file_id: str) -> Tuple[str, str]:
        """Download a file from Google Drive.
        
        Args:
            file_id: The ID of the file to download
            
        Returns:
            Tuple containing (temporary file path, original filename)
        """
        if not self.authenticated or not self.service:
            raise ValueError("Not authenticated with Google Drive")
        
        try:
            # Get file metadata to get the filename
            file_metadata = self.service.files().get(fileId=file_id).execute()
            filename = file_metadata['name']
            
            # Create a temporary file
            temp_dir = tempfile.gettempdir()
            temp_filepath = os.path.join(temp_dir, f"tea_labs_drive_{file_id}_{filename}")
            
            # Download the file
            request = self.service.files().get_media(fileId=file_id)
            with open(temp_filepath, 'wb') as f:
                downloader = MediaIoBaseDownload(f, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                    logger.info(f"Download progress: {int(status.progress() * 100)}%")
            
            return temp_filepath, filename
            
        except Exception as e:
            logger.error(f"Error downloading file from Google Drive: {str(e)}")
            raise ValueError(f"Failed to download file from Google Drive: {str(e)}")


class OneDriveService(CloudStorageService):
    """Microsoft OneDrive integration."""
    
    def __init__(self):
        super().__init__()
        self.app = None
        self.token_cache = None
        self.access_token = None
        
        # Create credentials directory if it doesn't exist
        os.makedirs('client_secrets', exist_ok=True)
    
    def authenticate(self) -> Dict[str, Any]:
        """Authenticate with Microsoft OneDrive.
        
        Returns:
            Dict with authentication result
        """
        try:
            # Check if we have client credentials
            if not os.path.exists(MICROSOFT_CREDENTIALS_PATH):
                logger.error(f"Microsoft credentials file not found at {MICROSOFT_CREDENTIALS_PATH}")
                return {
                    'error': 'Microsoft credentials file not found',
                    'provider': 'microsoft',
                    'requires_auth': True
                }
            
            # Load client credentials
            with open(MICROSOFT_CREDENTIALS_PATH, 'r') as f:
                client_config = json.load(f)
            
            # Set up MSAL application
            self.app = msal.PublicClientApplication(
                client_id=client_config['client_id'],
                authority=f"https://login.microsoftonline.com/{client_config.get('tenant_id', 'common')}",
                token_cache=msal.SerializableTokenCache()
            )
            
            # Try to get token from cache
            accounts = self.app.get_accounts()
            if accounts:
                result = self.app.acquire_token_silent(ONEDRIVE_SCOPES, account=accounts[0])
                if result:
                    self.access_token = result['access_token']
                    self.authenticated = True
                    return {
                        'authenticated': True,
                        'provider': 'microsoft'
                    }
            
            # No token in cache, need to start auth flow
            auth_url = self.app.get_authorization_request_url(
                scopes=ONEDRIVE_SCOPES,
                redirect_uri=client_config['redirect_uri']
            )
            
            logger.info(f"OneDrive auth URL: {auth_url}")
            return {
                'auth_url': auth_url,
                'provider': 'microsoft',
                'requires_auth': True
            }
            
        except Exception as e:
            logger.error(f"Error authenticating with OneDrive: {str(e)}")
            return {
                'error': f"Failed to authenticate with OneDrive: {str(e)}",
                'provider': 'microsoft',
                'requires_auth': True
            }
    
    def exchange_auth_code(self, auth_code: str) -> Dict[str, Any]:
        """Exchange authorization code for access token.
        
        Args:
            auth_code: The authorization code from Microsoft OAuth flow
            
        Returns:
            Dict with authentication result
        """
        try:
            # Load client credentials
            with open(MICROSOFT_CREDENTIALS_PATH, 'r') as f:
                client_config = json.load(f)
            
            # Get token from auth code
            result = self.app.acquire_token_by_authorization_code(
                code=auth_code,
                scopes=ONEDRIVE_SCOPES,
                redirect_uri=client_config['redirect_uri']
            )
            
            if 'access_token' in result:
                self.access_token = result['access_token']
                self.authenticated = True
                
                # Serialize and save token cache
                if self.app.token_cache.has_state_changed:
                    with open('client_secrets/ms_token_cache.json', 'w') as cache_file:
                        cache_file.write(self.app.token_cache.serialize())
                
                return {
                    'authenticated': True,
                    'provider': 'microsoft'
                }
            else:
                error = result.get('error_description', 'Unknown error')
                logger.error(f"Error exchanging auth code with OneDrive: {error}")
                return {
                    'error': error,
                    'provider': 'microsoft',
                    'requires_auth': True
                }
            
        except Exception as e:
            logger.error(f"Error exchanging auth code with OneDrive: {str(e)}")
            return {
                'error': f"Failed to authenticate with OneDrive: {str(e)}",
                'provider': 'microsoft',
                'requires_auth': True
            }
    
    def list_files(self, folder_id: Optional[str] = None, file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """List files in OneDrive, optionally filtered by folder and file types.
        
        Args:
            folder_id: Optional folder ID to list contents of
            file_types: Optional list of file extensions to filter by (e.g., ['csv', 'txt'])
            
        Returns:
            List of file metadata dictionaries
        """
        if not self.authenticated or not self.access_token:
            raise ValueError("Not authenticated with OneDrive")
        
        try:
            # Set up the API request
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Accept': 'application/json'
            }
            
            # Determine the endpoint based on folder_id
            if folder_id:
                url = f"https://graph.microsoft.com/v1.0/me/drive/items/{folder_id}/children"
            else:
                url = "https://graph.microsoft.com/v1.0/me/drive/root/children"
            
            # Make the request
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('value', [])
            
            # Filter items by file types if specified
            filtered_items = []
            if file_types:
                for item in items:
                    name = item.get('name', '')
                    if any(name.lower().endswith(f'.{ext.lower()}') for ext in file_types):
                        filtered_items.append(item)
            else:
                filtered_items = items
            
            # Format the results for our API
            formatted_files = []
            for file in filtered_items:
                # Skip folders unless folder_id is specified
                if file.get('folder') and not folder_id:
                    continue
                
                formatted_files.append({
                    'id': file['id'],
                    'name': file['name'],
                    'mime_type': file.get('file', {}).get('mimeType', 'folder'),
                    'size': file.get('size', '0'),
                    'modified_time': file.get('lastModifiedDateTime', ''),
                    'provider': 'microsoft'
                })
            
            return formatted_files
            
        except Exception as e:
            logger.error(f"Error listing files in OneDrive: {str(e)}")
            raise ValueError(f"Failed to list files in OneDrive: {str(e)}")
    
    def download_file(self, file_id: str) -> Tuple[str, str]:
        """Download a file from OneDrive.
        
        Args:
            file_id: The ID of the file to download
            
        Returns:
            Tuple containing (temporary file path, original filename)
        """
        if not self.authenticated or not self.access_token:
            raise ValueError("Not authenticated with OneDrive")
        
        try:
            # Set up the API request
            headers = {
                'Authorization': f'Bearer {self.access_token}'
            }
            
            # Get file metadata to get the filename and download URL
            metadata_url = f"https://graph.microsoft.com/v1.0/me/drive/items/{file_id}"
            metadata_response = requests.get(metadata_url, headers=headers)
            metadata_response.raise_for_status()
            
            metadata = metadata_response.json()
            filename = metadata['name']
            download_url = metadata['@microsoft.graph.downloadUrl']
            
            # Create a temporary file
            temp_dir = tempfile.gettempdir()
            temp_filepath = os.path.join(temp_dir, f"tea_labs_onedrive_{file_id}_{filename}")
            
            # Download the file
            download_response = requests.get(download_url, stream=True)
            download_response.raise_for_status()
            
            with open(temp_filepath, 'wb') as f:
                for chunk in download_response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            return temp_filepath, filename
            
        except Exception as e:
            logger.error(f"Error downloading file from OneDrive: {str(e)}")
            raise ValueError(f"Failed to download file from OneDrive: {str(e)}")


# Utility functions
def get_cloud_service(provider: str) -> CloudStorageService:
    """Get the appropriate cloud service instance based on provider name.
    
    Args:
        provider: The cloud service provider ('google' or 'microsoft')
        
    Returns:
        A CloudStorageService instance
    """
    if provider.lower() == 'google':
        return GoogleDriveService()
    elif provider.lower() in ('microsoft', 'onedrive'):
        return OneDriveService()
    else:
        raise ValueError(f"Unknown cloud storage provider: {provider}")


def save_oauth_credentials(provider: str, client_id: str, client_secret: str, redirect_uri: str = None, tenant_id: str = None) -> bool:
    """Save OAuth credentials for cloud storage providers.
    
    Args:
        provider: The cloud service provider ('google' or 'microsoft')
        client_id: OAuth client ID
        client_secret: OAuth client secret
        redirect_uri: Optional redirect URI (required for Microsoft)
        tenant_id: Optional tenant ID for Microsoft
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Create credentials directory if it doesn't exist
        os.makedirs('client_secrets', exist_ok=True)
        
        if provider.lower() == 'google':
            # Create a client_secrets.json file for Google
            google_creds = {
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob"]
                }
            }
            
            with open(GOOGLE_CREDENTIALS_PATH, 'w') as f:
                json.dump(google_creds, f)
                
        elif provider.lower() in ('microsoft', 'onedrive'):
            # Create a client_secrets.json file for Microsoft
            if not redirect_uri:
                redirect_uri = "https://login.microsoftonline.com/common/oauth2/nativeclient"
                
            ms_creds = {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri
            }
            
            if tenant_id:
                ms_creds["tenant_id"] = tenant_id
                
            with open(MICROSOFT_CREDENTIALS_PATH, 'w') as f:
                json.dump(ms_creds, f)
                
        else:
            logger.error(f"Unknown cloud storage provider: {provider}")
            return False
            
        return True
        
    except Exception as e:
        logger.error(f"Error saving OAuth credentials: {str(e)}")
        return False