import { useContext } from 'react'
import { ZenContext } from './zenContextValue'

export const useZen = () => useContext(ZenContext)
